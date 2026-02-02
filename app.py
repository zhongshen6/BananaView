# 版本v1.06
# 每次修改后将修改次数加一,注意不要改动版本号，并另起一行写下这次的修改内容
# 第21次修改，优化详情页图片切换逻辑，引入预加载机制防止背景图消失，增加切换时的加载过渡动画。
# 第22次修改，优化路由逻辑支持 SPA，详情页访问现在统一由 index.html 处理。
# 第23次修改，扩展详情页路由支持内容类型参数 /mod/api/{model}/{id}。

from flask import Flask, jsonify, request, send_from_directory, make_response
import time
import threading
import json
import os
import argparse
import sys
import logging
from threading import Lock
import requests
from pathlib import Path
import queue
from collections import defaultdict

BASE_DIR = Path(__file__).resolve().parent
API_URL = "https://gamebanana.com/apiv11/Game/8552/Subfeed"
DETAIL_URL = "https://api.gamebanana.com/Core/Item/Data"
CACHE_FILE = BASE_DIR / "static" / "subcategory_cache.json"
WORDS_URL = "https://api.hakush.in/gi/data/character.json"  # 更新为 hakush.in API
LOG_FILE = BASE_DIR / "app.log"

# 配置日志系统，同时输出到文件和控制台
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s',
    handlers=[
        logging.FileHandler(LOG_FILE, encoding='utf-8'),
        logging.StreamHandler(sys.stdout)
    ]
)

cache_lock = Lock()
subcategory_cache = {}
fetch_category_enabled = True

category_queue = queue.Queue()
rate_limit_lock = Lock()
last_request_time = 0
MIN_REQUEST_INTERVAL = 0.2

# 客户端限流配置
client_requests = defaultdict(list)
CLIENT_RATE_LIMIT = 50  # 每分钟最多请求次数
CLIENT_RATE_LIMIT_WINDOW = 60 # 限流窗口（秒）

# 创建全局 HTTP 会话池，提高连接复用效率
http_session = requests.Session()
adapter = requests.adapters.HTTPAdapter(pool_connections=10, pool_maxsize=20)
http_session.mount('http://', adapter)
http_session.mount('https://', adapter)

def log(msg):
    """统一日志调用接口"""
    logging.info(msg)

def load_cache():
    global subcategory_cache
    if os.path.exists(CACHE_FILE):
        try:
            with cache_lock:
                with open(CACHE_FILE, "r", encoding="utf-8") as f:
                    raw_data = json.load(f)
                
                # 过滤逻辑：只保留有有效名称和ID的条目，剔除“获取中”和“失败”的记录
                cleaned_data = {}
                for k, v in raw_data.items():
                    if isinstance(v, dict):
                        name = v.get("name")
                        # 成功的标准：有名称、名称不是旧版占位符、且有分类ID
                        # 同时也自动剔成了 status 为 "pending" 或 "failed" 的条目
                        if name and name != "获取中..." and v.get("id"):
                            cleaned_data[k] = v
                
                subcategory_cache = cleaned_data
            log(f"缓存文件加载并清理成功，有效条目数: {len(subcategory_cache)}")
        except Exception as e:
            log(f"缓存文件加载失败: {e}")
            subcategory_cache = {}
    else:
        log("未找到缓存文件，将新建")

def save_cache():
    try:
        with cache_lock:
            # 统计只包含有效名称 and ID 的条目
            valid_count = sum(1 for v in subcategory_cache.values() 
                             if isinstance(v, dict) and v.get("name") and v.get("name") != "获取中..." and v.get("id"))
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(subcategory_cache, f, ensure_ascii=False, indent=2)
        log(f"缓存文件已保存，有效条目数: {valid_count}")
    except Exception as e:
        log(f"缓存文件保存失败: {e}")

def update_translation_table():
    """从远程URL更新中英对照表 - 优化版"""
    default_file = BASE_DIR / "static" / "words.json"
    
    log("开始更新中英对照表...")
    
    try:
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json'
        }
        
        # 使用 Session 进行请求
        response = http_session.get(WORDS_URL, timeout=30, headers=headers)
        response.raise_for_status()
        remote_words = response.json()
        
        with open(default_file, "w", encoding="utf-8") as f:
            json.dump(remote_words, f, ensure_ascii=False, indent=2)
        
        log(f"中英对照表更新成功，条目数: {len(remote_words)}")
        return True
    except Exception as e:
        log(f"中英对照表更新失败: {e}")
        if os.path.exists(default_file):
            log("使用本地已有的翻译表")
            return True
        else:
            log("没有可用的翻译表")
            return False

def create_frontend_translation_table():
    default_file = BASE_DIR / "static" / "words.json"
    custom_file = BASE_DIR / "static" / "custom-words.json"
    output_file = BASE_DIR / "static" / "words-frontend.json"
    combined_words = []
    
    # 检查默认翻译表是否存在
    if not os.path.exists(default_file):
        log("默认翻译表不存在，尝试更新...")
        if not update_translation_table():
            log("无法获取翻译表，前端翻译表生成失败")
            return
    
    # 读取默认翻译表
    if os.path.exists(default_file):
        try:
            with open(default_file, "r", encoding="utf-8") as f:
                default_data = json.load(f)
                
                # 兼容处理：适配 hakush.in 的对象格式 (ID: {EN:..., CHS:...})
                if isinstance(default_data, dict):
                    extracted_count = 0
                    for entry in default_data.values():
                        if isinstance(entry, dict):
                            en = entry.get("EN")
                            chs = entry.get("CHS")
                            if en and chs:
                                combined_words.append({"en": en, "zhCN": chs})
                                extracted_count += 1
                    log(f"已加载字典格式翻译表，解析出条目数: {extracted_count}")
                elif isinstance(default_data, list):
                    # 处理旧版数组格式
                    combined_words.extend(default_data)
                    log(f"已加载列表格式翻译表，条目数: {len(default_data)}")
        except Exception as e:
            log(f"加载默认翻译表失败: {e}")
            return
    
    # 读取自定义翻译表
    if os.path.exists(custom_file):
        try:
            with open(custom_file, "r", encoding="utf-8") as f:
                custom_words = json.load(f)
                combined_words.extend(custom_words)
            log(f"已加载自定义翻译表，条目数: {len(custom_words)}")
        except Exception as e:
            log(f"加载自定义翻译表失败: {e}")
    else:
        log("未找到自定义翻译表，将只使用默认翻译表")
    
    # 创建精简版，只保留必要字段
    simplified_words = []
    seen = set()
    
    for word in combined_words:
        en = str(word.get("en", "")).strip('"')
        zhCN = word.get("zhCN", "")
        
        if en and zhCN:
            if en.lower() not in seen:
                seen.add(en.lower())
                simplified_words.append({
                    "en": en,
                    "zhCN": zhCN
                })
    
    # 保存精简版
    try:
        with open(output_file, "w", encoding="utf-8") as f:
            json.dump(simplified_words, f, ensure_ascii=False, indent=2)
        
        log(f"已创建前端翻译表，总条目数: {len(simplified_words)}")
        log(f"已保存到: {output_file}")
    except Exception as e:
        log(f"保存前端翻译表失败: {e}")

def rate_limited_fetch(item_id):
    global last_request_time
    
    with rate_limit_lock:
        current_time = time.time()
        time_since_last_request = current_time - last_request_time
        
        if time_since_last_request < MIN_REQUEST_INTERVAL:
            sleep_time = MIN_REQUEST_INTERVAL - time_since_last_request
            log(f"后端速率限制: 等待 {sleep_time:.2f} 秒后请求 {item_id}")
            time.sleep(sleep_time)
        
        last_request_time = time.time()
    
    fetch_subcategory_async(item_id)

def category_worker():
    log("分类获取工作线程已启动")
    while True:
        try:
            item_id = category_queue.get()
            if item_id is None:
                break
            log(f"工作线程处理分类请求: {item_id}")
            rate_limited_fetch(item_id)
            category_queue.task_done()
        except Exception as e:
            log(f"工作线程异常: {e}")
            time.sleep(1)

def fetch_subcategory_async(item_id): 
    if not fetch_category_enabled:
        return
    log(f"开始获取分类: {item_id}")
    try:
        url = f"{DETAIL_URL}?itemtype=Mod&itemid={item_id}&fields=Category().name,catid"
        # 使用 Session 复用连接
        res = http_session.get(url, timeout=6)
        res.raise_for_status()
        j = res.json()
        if isinstance(j, list) and len(j) >= 2:
            with cache_lock:
                subcategory_cache[str(item_id)] = {
                    "name": j[0],
                    "id": j[1]
                }
            save_cache()
            log(f"获取成功: {item_id} -> {j[0]}, {j[1]}")
        else:
            log(f"获取失败，数据格式异常: {item_id}")
            with cache_lock:
                subcategory_cache[str(item_id)] = {
                    "status": "failed",
                    "ts": int(time.time())
                }
            save_cache()
    except Exception as e:
        log(f"获取异常: {item_id} -> {e}")
        with cache_lock:
            subcategory_cache[str(item_id)] = {
                "status": "failed",
                "ts": int(time.time())
            }
        save_cache()

app = Flask(__name__, static_url_path='/mod/static')

# 简单的客户端限流检查
def check_client_rate_limit():
    ip = request.remote_addr
    now = time.time()
    times = client_requests[ip]
    # 清理窗口外的请求
    times[:] = [t for t in times if now - t < CLIENT_RATE_LIMIT_WINDOW]
    if len(times) >= CLIENT_RATE_LIMIT:
        return False
    times.append(now)
    return True

@app.after_request
def add_security_headers(response):
    """为所有响应添加安全头和基础性能头"""
    # 如果不是静态资源文件，则添加安全头
    if not request.path.startswith('/mod/static'):
        response.headers['X-Content-Type-Options'] = 'nosniff'
        response.headers['X-Frame-Options'] = 'SAMEORIGIN'
    return response

log("应用启动初始化...")
load_cache()

log("开始更新翻译表...")
if update_translation_table():
    log("翻译表更新成功，开始构建精简表...")
    create_frontend_translation_table()
else:
    log("翻译表更新失败，尝试使用现有文件构建精简表...")
    create_frontend_translation_table()

worker_thread = threading.Thread(target=category_worker, daemon=True)
worker_thread.start()
log("分类获取工作线程已启动")

CATEGORY_TTL = 600

@app.route('/mod/api/subcat')
def api_subcat():
    # 1. 客户端限流检查
    if not check_client_rate_limit():
        log(f"警告: 客户端 {request.remote_addr} 触发限流")
        return jsonify({"error": "Too Many Requests"}), 429

    if not fetch_category_enabled:
        return jsonify({})
    
    ids_param = request.args.get('ids')
    if not ids_param:
        return jsonify({})
    
    try:
        ids = [int(x) for x in ids_param.split(',') if x.strip().isdigit()]
    except Exception:
        return jsonify({})
    
    now = int(time.time())
    result = {}
    expire_seconds = 600
    
    for item_id in ids:
        # 特殊处理：ID 475764 作为健康检查探测点，不使用缓存，实时向 GameBanana 发起探测
        if item_id == 475764:
            try:
                log("健康检测：正在同步探测上游连接 (ID: 475764)...")
                test_url = f"{DETAIL_URL}?itemtype=Mod&itemid=475764&fields=Category().name,catid"
                test_res = http_session.get(test_url, timeout=5)
                test_res.raise_for_status()
                test_j = test_res.json()
                if isinstance(test_j, list) and len(test_j) >= 2:
                    result[item_id] = {"category": test_j[0], "catid": test_j[1]}
                else:
                    result[item_id] = {"status": "failed"}
            except Exception as e:
                log(f"健康检测：上游探测失败 -> {e}")
                result[item_id] = {"status": "failed"}
            continue

        key = str(item_id)
        with cache_lock:
            val = subcategory_cache.get(key)
        
        if not val:
            # 首次请求
            with cache_lock:
                subcategory_cache[key] = {"status": "pending", "ts": now}
            save_cache()
            category_queue.put(item_id)
            result[item_id] = {"status": "pending"}
            continue
        
        # 已成功获取
        if val.get("name") and val.get("name") != "获取中...":
            result[item_id] = {"category": val["name"], "catid": val.get("id")}
            continue
        
        # 正在获取或失败重试
        status = val.get("status")
        ts = val.get("ts", 0)
        
        if now - int(ts) > expire_seconds:
            # 过期重新获取
            with cache_lock:
                subcategory_cache[key] = {"status": "pending", "ts": now}
            save_cache()
            category_queue.put(item_id)
            result[item_id] = {"status": "pending"}
        else:
            if status == "pending":
                result[item_id] = {"status": "pending"}
            elif status == "failed":
                result[item_id] = {"status": "failed"}

    # 2. 添加浏览器缓存控制
    resp = make_response(jsonify(result))
    resp.headers['Cache-Control'] = 'no-cache' # 健康检测建议不缓存响应
    
    return resp

def register_frontend_routes(app):
    """注册前端相关路由"""
    @app.route('/mod/')
    @app.route('/mod')
    def serve_index():
        log("提供前端页面: index.html")
        response = make_response(send_from_directory(BASE_DIR, 'index.html'))
        response.headers['Cache-Control'] = 'no-cache'
        return response
    
    @app.route('/mod/api/<string:model>/<int:mod_id>')
    def serve_detail(model, mod_id):
        log(f"提供详情页面路由(SPA模式): [{model}] ID={mod_id}")
        # 在 SPA 模式下，直接请求详情 URL 应该返回主入口文件
        response = make_response(send_from_directory(BASE_DIR, 'index.html'))
        response.headers['Cache-Control'] = 'no-cache'
        return response

# 将前端路由注册移出 __main__ 块，确保在导入模式下也能注册
register_frontend_routes(app)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="BananaView Backend API")
    parser.add_argument("--serve", action="store_true", help="此参数目前仅用于兼容，前端路由现已默认注册")
    args = parser.parse_args()

    if args.serve:
        log("模式检测: 耦合模式已启用。可通过 http://localhost:9178/mod/ 访问前端。")
    else:
        log("模式检测: 服务器启动。")

    app.run(host="0.0.0.0", port=9178, debug=False)
