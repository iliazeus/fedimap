export const type = "activitypub";

export async function checkUrl(url, opts = {}) {
  return await checkObject(await fetchObjectByUrl(url, opts), opts);
}

export async function checkObject(obj, opts = {}) {
  if (typeof obj !== "object" || obj === null) return 0;

  let context = obj["@context"];

  if (typeof context === "string") {
    return context === "https://www.w3.org/ns/activitystreams" ? 0.9 : 0;
  }

  if (Array.isArray(context)) {
    return context.some((x) => x === "https://www.w3.org/ns/activitystreams")
      ? 0.5
      : 0;
  }

  if (context) {
    return 0.1;
  }

  return 0;
}

async function _fetchObject(ref, opts = {}) {
  if (typeof ref === "object" && ref !== null) return ref;
  if (typeof ref === "string") return await fetchObjectByUrl(ref, opts);
  return ref;
}

export async function fetchObjectByUrl(url, opts = {}) {
  const fetch = opts.fetch ?? globalThis.fetch;
  const signal = opts.signal;

  const response = await fetch(url, {
    headers: { accept: "application/activity+json" },
    signal,
  });

  const obj = await response.json();
  obj._fedijs = {
    fetchedFromOrigin: url.origin,
  };
  return obj;
}

export async function fetchCollectionByUrl(url, opts = {}) {
  const obj = await fetchObjectByUrl(url, opts);
  const maxEmptyPages = opts.maxEmptyPages ?? 2;
  const direction = opts.direction ?? (obj.first ? "forward" : "backward");

  return {
    _fedijs: obj._fedijs,
    id: obj.id,
    size: obj.totalItems,
    [Symbol.asyncIterator]:
      direction === "forward"
        ? async function* () {
            let emptyPagesLoaded = 0;
            for (let page = obj.first; page; page = page.next) {
              page = await _fetchObject(page, opts);
              const items = page.orderedItems ?? page.items;
              if (items) yield* items;
              if (!items || items.length === 0) emptyPagesLoaded += 1;
              if (emptyPagesLoaded >= maxEmptyPages) return;
              if (page.id === page.next) return;
            }
          }
        : async function* () {
            let emptyPagesLoaded = 0;
            for (let page = obj.last; page; page = page.prev) {
              page = await _fetchObject(page, opts);
              const items = page.orderedItems ?? page.items;
              if (items) yield* items;
              if (!items || items.length === 0) emptyPagesLoaded += 1;
              if (emptyPagesLoaded >= maxEmptyPages) return;
              if (page.id === page.prev) return;
            }
          },
  };
}
