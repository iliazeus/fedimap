class FediMap {
  cy;
  ap;
  corsProxyPrefix;

  constructor({ cy, ap, corsProxyPrefix } = {}) {
    if (!cy) throw new Error("cytoscape");
    if (!ap) throw new Error("ap");
    if (!corsProxyPrefix) throw new Error("corsProxyPrefix");

    this.cy = cy;
    this.ap = ap;
    this.corsProxyPrefix = corsProxyPrefix;

    cy.on("mouseover", "node", (e) => {
      cy.startBatch();

      e.target.addClass("hover");

      e.target
        .connectedEdges()
        .filter((el) => !el.hasClass("stub"))
        .addClass("node-hover");

      cy.endBatch();
    });

    cy.on("mouseout", "node", (e) => {
      cy.startBatch();

      e.target.removeClass("hover");

      e.target
        .connectedEdges()
        .filter((el) => !el.hasClass("stub"))
        .removeClass("node-hover");

      cy.endBatch();
    });

    cy.on("dblclick", "node", (e) => {
      window.open(e.target.data("id"), "_blank");
    });
  }

  async addProfile(profile, { log, signal } = {}) {
    const cy = this.cy;
    const ap = this.ap;

    let profileNode;

    try {
      log?.(`loading ${profile}`);

      try {
        await globalThis.fetch(
          this.corsProxyPrefix + encodeURIComponent("https://www.google.com"),
          { method: "head" }
        );
      } catch (error) {
        throw new Error("CORS proxy is not accessible", { cause: error });
      }

      profile = await ap.object(profile);

      {
        const _log = log;
        log = (s) => _log?.(`${profile.preferredUsername}: ${s}`);
      }

      log(`loading profile`);

      cy.startBatch();

      profileNode = cy.$id(profile.id);
      if (profileNode.hasClass("loading")) return;

      profileNode.scratch("signal", signal);

      if (profileNode.empty()) {
        cy.add({ data: profile, classes: ["loading"] });
        profileNode = cy.$id(profile.id);
      } else if (profileNode.hasClass("stub")) {
        profileNode.data(profile);
        profileNode.removeClass("stub");
        profileNode.removeClass("error");
        profileNode.addClass("loading");
      } else {
        profileNode.removeClass("error");
        profileNode.addClass("loading");

        profileNode
          .connectedEdges()
          .filter(
            (e) => e.target().hasClass("stub") || e.source().hasClass("stub")
          )
          .addClass("stub");
      }

      cy.endBatch();

      profileNode
        .layout({
          name: "random",
          boundingBox: {
            x1: -cy.width() / 8,
            y1: -cy.height() / 8,
            x2: cy.width() / 8,
            y2: cy.height() / 8,
          },
          animate: true,
          fit: true,
        })
        .run();

      log(`loading following`);

      const follows = await ap.object(profile.following);
      let loadedFollows = 0;
      for await (let follow of ap.collection(follows)) {
        signal?.throwIfAborted();

        log(`loading follows: ${loadedFollows}/${follows.totalItems}`);

        cy.startBatch();

        let node = cy.$id(ap.id(follow));
        if (node.empty()) {
          cy.add({ data: { id: ap.id(follow) }, classes: ["stub"] });
          node = cy.$id(ap.id(follow));
        }

        const edgeId = profile.id + "::" + ap.id(follow);
        let edge = cy.$id(edgeId);

        if (edge.empty()) {
          cy.add({
            data: { id: edgeId, source: profile.id, target: ap.id(follow) },
          });
          edge = cy.$id(edgeId);
        } else {
          edge.removeClass("stub");
        }

        cy.endBatch();

        loadedFollows += 1;
      }

      log(`loading followers`);

      const followers = await ap.object(profile.followers);
      let loadedFollowers = 0;
      for await (let follower of ap.collection(followers)) {
        signal?.throwIfAborted();

        log(`loading followers: ${loadedFollowers}/${followers.totalItems}`);

        cy.startBatch();

        let node = cy.$id(ap.id(follower));
        if (node.empty()) {
          cy.add({ data: { id: ap.id(follower) }, classes: ["stub"] });
          node = cy.$id(ap.id(follower));
        }

        const edgeId = ap.id(follower) + "::" + profile.id;
        let edge = cy.$id(edgeId);

        if (edge.empty()) {
          cy.add({
            data: {
              id: edgeId,
              source: ap.id(follower),
              target: profile.id,
            },
          });
          edge = cy.$id(edgeId);
        } else {
          edge.removeClass("stub");
        }

        cy.endBatch();

        loadedFollowers += 1;
      }

      log(`done`);
    } catch (error) {
      profileNode?.addClass("error");
      throw error;
    } finally {
      profileNode?.removeClass("loading");
      profileNode?.removeScratch("signal");
    }
  }

  clear() {
    this.cy.remove("node");
  }

  removeSelected() {
    const eles = this.cy
      .$("node:selected")
      .filter((el) => !el.hasClass("loading"));

    eles.addClass("stub");
    eles.forEach((el) => {
      if (el.neighborhood("node").every((el) => el.hasClass("stub"))) {
        el.remove();
      }
    });
  }

  getCommonFollowersForSelected() {
    const eles = this.cy.$("node:selected");

    let result = null;
    eles.forEach((el) => {
      const followers = el.incomers("node");
      result = result ? result.intersection(followers) : followers;
    });

    return result ? result.map((el) => el.data("id")) : [];
  }

  getCommonFollowsForSelected() {
    const eles = this.cy.$("node:selected");

    let result = null;
    eles.forEach((el) => {
      const follows = el.outgoers("node");
      result = result ? result.intersection(follows) : follows;
    });

    return result ? result.map((el) => el.data("id")) : [];
  }
}

if (typeof module !== "undefined") module.exports.FediMap = FediMap;
globalThis.FediMap = FediMap;
