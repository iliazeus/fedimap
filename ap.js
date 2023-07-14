class APContext {
  static niceFetch = async (url, opts) => {
    if (opts?.corsProxyPrefix) {
      url = opts.corsProxyPrefix + encodeURIComponent(url);
    }

    let response;

    for (
      let retryCount = 0;
      retryCount <= opts?.maxRetryCount ?? 0;
      retryCount += 1
    ) {
      response = await globalThis.fetch(url, {
        ...opts,
        signal: opts?.timeout && AbortSignal.timeout?.(opts.timeout),
      });

      if (response.ok) return response;

      if (response.status === 429 || response.status >= 500) {
        const retryAfter = response.headers.get("retry-after");

        if (!retryAfter) {
          continue;
        }

        const retryAfterMs = Number(retryAfter) * 1000;
        if (Number.isNaN(retryAfterMs)) {
          retryAfterMs = new Date(retryAfter).valueOf() - Date.now();
        }

        await new Promise((cb) => setTimeout(cb, retryAfterMs));
        continue;
      }

      return response;
    }

    return response;
  };

  #cache;
  #maxCacheSize;
  #fetch;

  constructor(opts = { cacheSize: 1024, fetch: APContext.niceFetch }) {
    this.#cache = new Map();
    this.#maxCacheSize = opts.cacheSize;
    this.#fetch = opts.fetch;
  }

  #cacheGet(key, force) {
    if (force) {
      this.#cache.delete(key);
      return undefined;
    }

    return this.#cache.get(key);
  }

  #cacheSet(key, value) {
    for (const key of this.#cache.keys()) {
      if (this.#cache.size < this.#maxCacheSize) break;
      this.#cache.delete(key);
    }

    this.#cache.set(key, value);
    return value;
  }

  get cacheSize() {
    return this.#cache.size;
  }

  clearCache() {
    this.#cache.clear();
  }

  async webfinger(id) {
    if (id.startsWith("@")) id = id.slice(1);

    const origin = new URL(id.includes(":") ? id : "https://" + id).origin;

    const response = await this.#fetch(
      origin + "/.well-known/webfinger?resource=acct:" + encodeURIComponent(id)
    );

    const json = await response.json();

    const types = [
      "application/activity+json",
      'application/ld+json; profile="https://www.w3.org/ns/activitystreams"',
    ];

    const entry = json.links.find(
      (e) => e.rel === "self" && types.includes(e.type)
    );

    return entry?.href;
  }

  id(ref) {
    if (typeof ref === "object" && ref !== null) ref = ref.id;
    if (typeof ref !== "string") return undefined;
    return ref;
  }

  async object(ref, opts = {}) {
    if (typeof ref === "object" && ref !== null) {
      if (typeof ref.id === "string") this.#cache.set(ref.id, ref);
      return ref;
    }

    if (typeof ref !== "string") return ref;

    let value = this.#cacheGet(ref, opts.force);
    if (value) return value;

    if (ref.startsWith("@")) ref = await this.webfinger(ref);

    const headers = { ...opts.headers, accept: "application/activity+json" };

    const response = await this.#fetch(ref, { ...opts, headers });
    value = await response.json();

    if ("error" in value) throw new Error(value.error);

    return this.#cacheSet(ref, value);
  }

  async blob(link, opts = {}) {
    if (typeof link !== "object" || ref === null) {
      link = await this.object(link, opts);
    }

    if (typeof link !== "object" || ref === null) return null;

    const url = link.url ?? link.href;
    const mediaType = link.mediaType;

    if (typeof url !== "string") return null;

    let blob = this.#cacheGet(url, opts.force);
    if (blob) return blob;

    const headers = { ...opts.headers };
    if (typeof mediaType === "string") headers.accept = mediaType;

    const response = await this.#fetch(url, { ...opts, headers });
    blob = await response.blob();

    return this.#cacheSet(url, blob);
  }

  async *collection(ref, opts = {}) {
    ref = await this.object(ref, opts);

    if (typeof ref !== "object" || ref === null) return;
    if (!ref.first && !ref.last) return;

    if (!opts.reverse) {
      for (let page = ref.first; page; page = page.next) {
        page = await this.object(page, opts);
        const items = page.orderedItems ?? page.items;
        if (items) yield* items;
      }
    } else {
      for (let page = ref.last; page; page = page.prev) {
        page = await this.object(page, opts);
        const items = page.orderedItems ?? page.items;
        if (items) yield* items.reverse();
      }
    }
  }
}

globalThis.APContext = APContext;
if (typeof module !== "undefined") module.exports.APContext = APContext;
