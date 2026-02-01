export const Translator = (() => {
  const translationMap = new Map(); // 翻译映射表
  let isLoaded = false; // 翻译表是否已加载
  let sortedKeys = null; // 按长度排序的键列表(用于最长匹配)

  // 加载翻译表
  async function loadTranslationTable(baseUrl = '') {
    if (isLoaded) return;
    try {
      const res = await fetch(`${baseUrl}static/words-frontend.json`);
      const words = await res.json();
      for (const word of words) {
        if (word.en && word.zhCN) {
          const englishKey = word.en.replace(/^\"+|\"+$/g, '').toLowerCase();
          translationMap.set(englishKey, word.zhCN);
        }
      }
      // 创建按长度降序排列的键列表，确保最长匹配优先
      sortedKeys = Array.from(translationMap.keys()).sort((a, b) => b.length - a.length);
      isLoaded = true;
      console.log('翻译表加载完成，条目数:', translationMap.size);
    } catch (err) {
      console.error('加载翻译表失败:', err);
    }
  }

  // 翻译分类名称功能
  function translateCategory(category) {
    if (!isLoaded || !category) return category;
    const key = category.toLowerCase();
    return translationMap.get(key) || category;
  }

  // 翻译名称功能
  function translateModName(name) {
    if (!isLoaded || !name) return name;
    let result = name;
    const lower = () => result.toLowerCase();
    for (const key of sortedKeys) {
      const idx = lower().indexOf(key);
      if (idx !== -1) {
        // 单词边界启发式检查
        const isWordBoundary = (
          (idx === 0 || !result[idx - 1].match(/[a-z]/i)) &&
          (idx + key.length === result.length || !result[idx + key.length].match(/[a-z]/i))
        );
        if (isWordBoundary) {
          const originalCase = result.substring(idx, idx + key.length);
          let replacement = translationMap.get(key);
          if (!replacement) continue;
          // 保持原始大小写格式
          if (originalCase === originalCase.toUpperCase()) replacement = replacement.toUpperCase();
          else if (originalCase[0] === originalCase[0].toUpperCase())
            replacement = replacement.charAt(0).toUpperCase() + replacement.slice(1);
          result = result.substring(0, idx) + replacement + result.substring(idx + key.length);
        }
      }
    }
    return result;
  }

  // 执行翻译内容数据
  function translateContent(data) {
    if (!isLoaded) return data;
    if (Array.isArray(data)) {
      return data.map(mod => ({
        ...mod,
        name: mod.name ? translateModName(mod.name) : mod.name,
        category: mod.category ? translateCategory(mod.category) : mod.category
      }));
    } else if (typeof data === 'object' && data !== null) {
      const result = {};
      for (const id in data) {
        if (data[id] && (data[id].category || data[id].status)) {
          if (data[id].category) {
            result[id] = { ...data[id], category: translateCategory(data[id].category) };
          } else {
            result[id] = data[id];
          }
        } else {
          result[id] = data[id];
        }
      }
      return result;
    }
    return data;
  }

  return { 
    loadTranslationTable, 
    translateCategory, 
    translateModName, 
    translateContent, 
    isLoaded: () => isLoaded 
  };
})();