const _apis = [];
const _apiByOrigin = new Map();

export function registerApi(api) {
  _apis.push(api);
}

export async function fetch(ref, opts = {}) {
  const log = opts.log;

  if (ref === undefined || ref === null) return ref;

  if (typeof ref === "string") {
    const url = new URL(ref);

    const apiByOrigin = _apiByOrigin.get(url.origin);
    if (apiByOrigin) {
      try {
        return await _fetchByUrl(apiByOrigin, url, opts);
      } catch (error) {
        _apiByOrigin.delete(url.origin);
        throw error;
      }
    }

    let bestApi = _apis.find((api) => api.type === "activitypub");
    let bestConfidence = 0;

    for (const api of _apis) {
      try {
        const confidence = await api.checkUrl(url, opts);
        if (confidence > bestConfidence) bestApi = api;
      } catch (error) {
        log?.(error);
      }
    }

    if (!bestApi) throw new Error(`cound not find api for ${url}`);
    const result = await _fetchByUrl(bestApi, url, opts);

    _apiByOrigin.set(url.origin, bestApi);
    return result;
  }

  if (typeof ref === "object") {
    if (ref === null) return ref;

    const id = ref.id;
    const fetchedFromOrigin = ref._fedijs?.fetchedFromOrigin;

    if (
      typeof fetchedFromOrigin === "string" &&
      typeof id === "string" &&
      new URL(id).origin === fetchedFromOrigin &&
      !opts.reload
    ) {
      return ref;
    }

    if (typeof id === "string") {
      try {
        return await fetch(ref.id, opts);
      } catch (error) {
        log?.(error);
      }
    }
  }

  throw new TypeError(`could not fetch ${ref}`);
}

async function _fetchByUrl(api, url, opts = {}) {
  const responseType = opts.responseType ?? "object";

  if (responseType === "object") {
    return await api.fetchObjectByUrl(url, opts);
  }

  if (responseType === "collection") {
    return await api.fetchCollectionByUrl(url, opts);
  }

  throw new TypeError(`unknown responseType: ${responseType}`);
}
