# 版本v0.94，每次更新代码就将版本号加0.01

from flask import Flask, render_template, jsonify, request
import time
import threading
import json
import os
from threading import Lock
import requests
from pathlib import Path
import queue

BASE_DIR = Path(__file__).resolve().parent
API_URL = "https://gamebanana.com/apiv11/Game/8552/Subfeed"
DETAIL_URL = "https://api.gamebanana.com/Core/Item/Data"
CACHE_FILE = BASE_DIR / "static" / "subcategory_cache.json"
WORDS_URL = "http://dataset.genshin-dictionary.com/words.json"  # 直接使用HTTP

cache_lock = Lock()
subcategory_cache = {}
fetch_category_enabled = True

category_queue = queue.Queue()
rate_limit_lock = Lock()
last_request_time = 0
MIN_REQUEST_INTERVAL = 0.2

def log(msg):
    print(f"[DEBUG {time.strftime('%H:%M:%S')}] {msg}")

def load_cache():
    global subcategory_cache
    if os.path.exists(CACHE_FILE):
        try:
            with cache_lock:
                with open(CACHE_FILE, "r", encoding="utf-8") as f:
                    subcategory_cache = json.load(f)
            log(f"缓存文件加载成功，条目数: {len(subcategory_cache)}")
        except Exception as e:
            log(f"缓存文件加载失败: {e}")
            subcategory_cache = {}
    else:
        log("未找到缓存文件，将新建")

def save_cache():
    try:
        with cache_lock:
            with open(CACHE_FILE, "w", encoding="utf-8") as f:
                json.dump(subcategory_cache, f, ensure_ascii=False, indent=2)
        log(f"缓存文件已保存，条目数: {len(subcategory_cache)}")
    except Exception as e:
        log(f"缓存文件保存失败: {e}")

def update_translation_table():
    """从远程URL更新中英对照表 - 简化版"""
    default_file = BASE_DIR / "static" / "words.json"
    
    log("开始更新中英对照表...")
    
    # 直接使用HTTP协议，因为已知它工作正常
    try:
        # 设置兼容性头部
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            'Accept': 'application/json',
            'Accept-Encoding': 'gzip, deflate'
        }
        
        response = requests.get(WORDS_URL, timeout=30, headers=headers)
        response.raise_for_status()
        remote_words = response.json()
        
        # 保存到本地默认翻译表
        with open(default_file, "w", encoding="utf-8") as f:
            json.dump(remote_words, f, ensure_ascii=False, indent=2)
        
        log(f"中英对照表更新成功，条目数: {len(remote_words)}")
        return True
    except Exception as e:
        log(f"中英对照表更新失败: {e}")
        
        # 如果更新失败但本地已有文件，仍然继续
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
                default_words = json.load(f)
                combined_words.extend(default_words)
            log(f"已加载默认翻译表，条目数: {len(default_words)}")
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
        en = word.get("en", "").strip('"')
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
            log(f"速率限制: 等待 {sleep_time:.2f} 秒后请求 {item_id}")
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
        res = requests.get(url, timeout=6)
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
                    "name": "获取中...",
                    "id": None,
                    "ts": int(time.time())
                }
            save_cache()
    except Exception as e:
        log(f"获取异常: {item_id} -> {e}")
        with cache_lock:
            subcategory_cache[str(item_id)] = {
                "name": "获取中...",
                "id": None,
                "ts": int(time.time())
            }
        save_cache()

app = Flask(__name__, static_url_path='/mod/static')

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
        key = str(item_id)
        with cache_lock:
            val = subcategory_cache.get(key)
        
        if not val:
            log(f"缓存未命中: {item_id}")
            with cache_lock:
                subcategory_cache[key] = {"status": "pending", "ts": now}
            save_cache()
            category_queue.put(item_id)
            log(f"首次请求，提交到分类队列: {item_id}")
            continue
        
        if val.get("name") and val.get("name") != "获取中...":
            result[item_id] = {"category": val["name"], "catid": val.get("id")}
            log(f"缓存命中: {item_id} -> {val['name']}")
            continue
        
        ts = val.get("ts")
        if ts:
            if now - int(ts) > expire_seconds:
                log(f"缓存过期: {item_id}, 删除记录")
                with cache_lock:
                    if key in subcategory_cache:
                        del subcategory_cache[key]
                save_cache()
            else:
                log(f"缓存获取中未过期: {item_id}")

    return jsonify(result)

@app.route("/mod/")
def index():
    return render_template('index.html')

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)