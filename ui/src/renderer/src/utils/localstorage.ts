export class LocalStorageService {
  static get(key: string): any {
    let data = localStorage.getItem(key);
    if (!data) {
      return data;
    }
    try {
      data = JSON.parse(data);
      return data;
    } catch (_e) {
      return null;
    }
  }

  static set(key: string, value: any) {
    try {
      const data = JSON.stringify(value);
      return localStorage.setItem(key, data);
    } catch (_e) {
      console.error('Error set localstorage: ', _e);
    }
  }

  static delete(key: string) {
    return localStorage.removeItem(key);
  }
}
