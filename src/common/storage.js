// common/storage.js
import storage from '@system.storage';

/**
 * 检查某个 key 是否存在
 * @param {string} key
 * @returns {Promise<boolean>}
 */
export function storageHas(key) {
    return new Promise((resolve) => {
      try {
        storage.get({
          key: key,
          success: () => resolve(true),
          fail: () => resolve(false)
        });
      } catch (e) {
        console.error('[storageHas] 异常:', e);
        resolve(false);
      }
    });
  }
  
  /**
   * 写入数据（自动 JSON 序列化）
   * @param {string} key
   * @param {any} value
   * @returns {Promise<boolean>}
   */
  export function storageWrite(key, value) {
    return new Promise(async (resolve) => {
      try {
        const jsonStr = JSON.stringify(value);
        storage.set({
          key: key,
          value: jsonStr,
          success: () => resolve(true),
          fail: (data, code) => {
            console.error(`[storageWrite] 失败 key=${key}, code=${code}, msg=${data}`);
            resolve(false);
          }
        });
      } catch (e) {
        console.error('[storageWrite] 序列化或调用异常:', e);
        resolve(false);
      }
    });
  }
  
/**
 * 读取数据（支持自动反序列化与类型转换）
 * @param {string} key
 * @param {string} type 'int' | 'arr' | 'obj' | 'string' | 'auto' | 'raw'
 * @returns {Promise<any>}
 */
export function storageRead(key, type = 'auto') {
  return new Promise(async (resolve) => {
    let rawValue = '';
    try {
      rawValue = await new Promise((res) => {
        storage.get({
          key: key,
          success: (data) => res(data),
          fail: () => res('')
        });
      });
    } catch (e) {
      console.error('[storageRead] 读取异常:', e);
      rawValue = '';
    }

    // raw 模式：直接返回原始字符串，不做任何处理
    if (type === 'raw') {
      resolve(rawValue);
      return;
    }

    // 空值处理
    if (rawValue === '') {
      if (type === 'int') resolve(0);
      else if (type === 'arr') resolve([]);
      else if (type === 'obj') resolve({});
      else resolve('');
      return;
    }

    try {
      switch (type) {
        case 'int':
          const num = parseInt(rawValue, 10);
          resolve(isNaN(num) ? 0 : num);
          break;
        case 'arr':
          const arr = JSON.parse(rawValue);
          resolve(Array.isArray(arr) ? arr : []);
          break;
        case 'obj':
          const obj = JSON.parse(rawValue);
          resolve(obj && typeof obj === 'object' && !Array.isArray(obj) ? obj : {});
          break;
        case 'string':
          resolve(rawValue);
          break;
        case 'auto':
        default:
          try {
            resolve(JSON.parse(rawValue));
          } catch {
            resolve(rawValue);
          }
          break;
      }
    } catch (e) {
      console.error('[storageRead] 解析异常:', e, '原始值:', rawValue);
      if (type === 'int') resolve(0);
      else if (type === 'arr') resolve([]);
      else if (type === 'obj') resolve({});
      else resolve('');
    }
  });
}
  
  /**
   * 删除指定 key
   * @param {string} key
   * @returns {Promise<boolean>}
   */
  export function storageDelete(key) {
    return new Promise((resolve) => {
      try {
        storage.delete({
          key: key,
          success: () => resolve(true),
          fail: (data, code) => {
            console.error(`[storageDelete] 失败 key=${key}, code=${code}`);
            resolve(false);
          }
        });
      } catch (e) {
        console.error('[storageDelete] 异常:', e);
        resolve(false);
      }
    });
  }
  
  /**
   * 清空所有存储
   * @returns {Promise<boolean>}
   */
  export function storageClear() {
    return new Promise((resolve) => {
      try {
        storage.clear({
          success: () => resolve(true),
          fail: (data, code) => {
            console.error(`[storageClear] 失败 code=${code}`);
            resolve(false);
          }
        });
      } catch (e) {
        console.error('[storageClear] 异常:', e);
        resolve(false);
      }
    });
  }
