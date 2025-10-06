# 版本v0.86，每次更新代码就将版本号加0.01

#重要

#增加更多界面，mod详情
#增加nsfw标识

#可选
#缓存未命中时，后端api调用速度过快
#页面缓存

from flask import Flask, render_template, jsonify, request
import time
import threading
import json
import os
from threading import Lock
import requests
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent  # 获取当前文件所在目录的绝对路径
API_URL = "https://gamebanana.com/apiv11/Game/8552/Subfeed"
DETAIL_URL = "https://api.gamebanana.com/Core/Item/Data"
CACHE_FILE = BASE_DIR / "static" / "subcategory_cache.json"

cache_lock = Lock()  # 添加线程锁保护缓存操作
subcategory_cache = {}
fetch_category_enabled = True  # 是否获取分类开关

def log(msg):
    print(f"[DEBUG {time.strftime('%H:%M:%S')}] {msg}")

#    ===================================================--- 缓存管理逻辑 
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


# generate_translations.py - 生成前端翻译表的脚本
def create_frontend_translation_table():
    default_file = BASE_DIR / "static" / "words.json"
    custom_file = BASE_DIR / "static" / "custom-words.json"
    output_file = BASE_DIR / "static" / "words-frontend.json"
    combined_words = []
    
    # 读取默认翻译表
    if os.path.exists(default_file):
        try:
            with open(default_file, "r", encoding="utf-8") as f:
                default_words = json.load(f)
                combined_words.extend(default_words)
            print(f"已加载默认翻译表，条目数: {len(default_words)}")
        except Exception as e:
            print(f"加载默认翻译表失败: {e}")
            return
    
    # 读取自定义翻译表
    if os.path.exists(custom_file):
        try:
            with open(custom_file, "r", encoding="utf-8") as f:
                custom_words = json.load(f)
                combined_words.extend(custom_words)
            print(f"已加载自定义翻译表，条目数: {len(custom_words)}")
        except Exception as e:
            print(f"加载自定义翻译表失败: {e}")
    else:
        print("未找到自定义翻译表，将只使用默认翻译表")
    
    # 创建精简版，只保留必要字段
    simplified_words = []
    seen = set()  # 用于去重
    
    for word in combined_words:
        en = word.get("en", "").strip('"')
        zhCN = word.get("zhCN", "")
        
        if en and zhCN:
            # 检查是否已经存在相同的英文词条
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
        
        print(f"已创建前端翻译表，总条目数: {len(simplified_words)}")
        print(f"已保存到: {output_file}")
    except Exception as e:
        print(f"保存前端翻译表失败: {e}")
app = Flask(__name__, static_url_path='/mod/static')

# 在应用启动时加载缓存
load_cache()
# 生成精简版翻译表
create_frontend_translation_table()



   #========================================================分类获取api
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
            # 成功：只写 name/id，不写时间戳
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
                # 失败：标记获取中，写入时间戳（秒级整数）
                subcategory_cache[str(item_id)] = {
                    "name": "获取中...",
                    "id": None,
                    "ts": int(time.time())
                }
            save_cache()
    except Exception as e:
        log(f"获取异常: {item_id} -> {e}")
        with cache_lock:
            # 异常：同样写“获取中...”带时间戳
            subcategory_cache[str(item_id)] = {
                "name": "获取中...",
                "id": None,
                "ts": int(time.time())
            }
        save_cache()


CATEGORY_TTL = 600  # 10分钟过期

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
    expire_seconds = 600  # 10分钟过期
    
    for item_id in ids:
        key = str(item_id)
        with cache_lock:
            val = subcategory_cache.get(key)
        
        if not val:
            log(f"缓存未命中: {item_id}")
            with cache_lock:
                subcategory_cache[key] = {"status": "pending", "ts": now}
            save_cache()
            threading.Thread(target=fetch_subcategory_async, args=(item_id,), daemon=True).start()
            log(f"首次请求，启动异步抓取: {item_id}")
            continue
        
        # ✅ 分类已成功获取
        if val.get("name") and val.get("name") != "获取中...":
            result[item_id] = {"category": val["name"], "catid": val.get("id")}
            log(f"缓存命中: {item_id} -> {val['name']}")
            continue
        
        # ⚠️ "获取中..." 状态
        ts = val.get("ts")
        if ts:
            if now - int(ts) > expire_seconds:
                # 超时 → 删除缓存，下次触发重新获取
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