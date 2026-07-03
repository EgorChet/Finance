import { defineStore } from "pinia";
import { ref } from "vue";

export type CacheLoadOptions = { background?: boolean; force?: boolean };

export function createCachedStore<T>(
  id: string,
  fetcher: (demo: boolean, token: string | undefined) => Promise<T>,
  getCacheKey: (demo: boolean, token: string | undefined) => string = (demo, token) =>
    `${demo}:${token ?? ""}`,
) {
  return defineStore(id, () => {
    const data = ref<T | null>(null);
    const loading = ref(false);
    const refreshing = ref(false);

    let activeKey = "";
    let requestId = 0;

    function peek(demo: boolean, token: string | undefined): T | null {
      const key = getCacheKey(demo, token);
      if (data.value && activeKey === key) return data.value;
      return null;
    }

    function invalidate() {
      data.value = null;
      activeKey = "";
    }

    async function load(
      demo: boolean,
      token: string | undefined,
      options: CacheLoadOptions = {},
    ): Promise<T> {
      const key = getCacheKey(demo, token);
      const cached = data.value && activeKey === key ? data.value : null;

      if (cached && !options.background && !options.force) {
        void load(demo, token, { background: true });
        return cached;
      }

      const reqId = ++requestId;
      if (options.background) refreshing.value = true;
      else loading.value = true;

      try {
        const result = await fetcher(demo, token);
        if (reqId !== requestId) return data.value ?? result;
        data.value = result;
        activeKey = key;
        return result;
      } catch (e) {
        if (cached) return cached;
        throw e;
      } finally {
        if (reqId === requestId) {
          loading.value = false;
          refreshing.value = false;
        }
      }
    }

    return { data, loading, refreshing, peek, invalidate, load };
  });
}
