import * as activitypub from "./fedi-activitypub.js";

export const type = "misskey";

const _compatibleSourceRepos = new Set([
  "https://github.com/misskey-dev/misskey",
  "https://gitlab.com/satoaki-ooto/foundkey",
  "https://codeberg.org/firefish/firefish",
  "https://gitlab.prometheus.systems/firefish/firefish",
]);

export async function checkUrl(url, opts = {}) {
  const meta = await _apiFetch(
    `${url.origin}/api/meta`,
    { detail: false },
    opts
  );

  const repositoryUrl = meta.repositoryUrl;
  if (typeof repositoryUrl !== "string") return 0.1;

  return _compatibleSourceRepos.has(repositoryUrl) ? 1.0 : 0.8;
}

export async function fetchObjectByUrl(url, opts = {}) {
  try {
    const obj = await activitypub.fetchObjectByUrl(url, opts);
    obj._fedijs.api = "misskey";
    return obj;
  } catch (error) {
    let match;

    match = url.pathname.match(/^\/notes\/([^/]+)$/);
    if (match) {
      const note = await _apiFetch(
        `${url.origin}/api/notes/show`,
        { noteId: match[1] },
        opts
      );

      const children = await _apiFetch(
        `${url.origin}/api/notes/children`,
        { noteId: match[1], depth: 1, limit: 50 },
        opts
      );

      return _convertNote(note, url, { ...opts, children });
    }

    throw error;
  }
}

export async function fetchCollectionByUrl(url, opts = {}) {
  const obj = await fetchObjectByUrl(url, opts);
  return activitypub.collectionFromObject(obj, opts);
}

function _convertUser(user, url, opts = {}) {
  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    _fedijs: {
      fetchedFromOrigin: url.origin,
      api: "misskey",
    },

    type: "Person",
    id: `${url.origin}/users/${user.id}`,
    url: `${url.origin}/@${user.username}`,
    preferredUsername: user.username,
    published: user.createdAt,
    icon: user.avatarUrl && { url: user.avatarUrl },
  };
}

function _convertNote(note, url, opts = {}) {
  const children = opts.children;

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    _fedijs: {
      fetchedFromOrigin: url.origin,
      api: "misskey",
    },

    type: "Note",
    id: note.uri ?? `${url.origin}/notes/${note.id}`,
    url: note.url ?? `${url.origin}/notes/${note.id}`,
    attributedTo: _convertUser(note.user, url, { opts }),
    published: note.createdAt,
    content: note.text,
    // TODO: attachments

    inReplyTo: note.reply?.uri,

    replies: children
      ? _convertNoteRepliesCollection(
          children.filter((x) => x.replyId === note.id),
          url,
          { ...opts, note }
        )
      : undefined,
  };
}

function _convertNoteRepliesCollection(notes, url, opts = {}) {
  const note = opts.note;
  if (!note) throw new TypeError("note");

  return {
    "@context": "https://www.w3.org/ns/activitystreams",
    _fedijs: {
      fetchedFromOrigin: url.origin,
      api: "misskey",
    },

    type: "Collection",
    id: `${url.origin}/notes/${note.id}/replies?invented-by=fedijs`,
    totalItems: note.repliesCount,

    first: {
      "@context": "https://www.w3.org/ns/activitystreams",
      _fedijs: {
        fetchedFromOrigin: url.origin,
        api: "misskey",
      },

      type: "CollectionPage",
      id: `${url.origin}/notes/${note.id}/replies?page=true&invented-by=fedijs`,
      items: notes.map((x) =>
        _convertNote(x, url, { ...opts, children: undefined })
      ),
    },
  };
}

async function _apiFetch(url, params, opts = {}) {
  const fetch = opts.fetch ?? globalThis.fetch;

  const response = await fetch(url, {
    method: "post",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(params),
  });

  if (!response.ok) {
    throw new Error(await response.text().catch(() => undefined));
  }

  return await response.json();
}
