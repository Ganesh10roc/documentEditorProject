import { describe, expect, it } from "vitest";
import * as Y from "yjs";
import { cloneXmlNode, fragmentToText } from "@/server/services/yjs-xml";

/**
 * These tests pin down the two guarantees the whole sync architecture rests on:
 *
 *  1. Concurrent edits merge deterministically with NO data loss, regardless of
 *     the order the server receives/merges them (commutativity + associativity).
 *  2. Restoring a version is a normal CRDT edit that converges — it never resets
 *     or corrupts a collaborator's live document.
 *
 * They exercise the exact primitives the server uses (Y.mergeUpdates,
 * encodeStateAsUpdate, cloneXmlNode) with no database or network.
 */

function makeDoc(text: string): Y.Doc {
  const doc = new Y.Doc();
  const frag = doc.getXmlFragment("prosemirror");
  const p = new Y.XmlElement("paragraph");
  p.insert(0, [new Y.XmlText(text)]);
  frag.insert(0, [p]);
  return doc;
}

describe("CRDT merge — offline sync core", () => {
  it("merges concurrent offline edits without losing either side", () => {
    // Shared starting point, distributed to two offline clients.
    const base = makeDoc("Shared start. ");
    const baseUpdate = Y.encodeStateAsUpdate(base);

    const alice = new Y.Doc();
    Y.applyUpdate(alice, baseUpdate);
    const bob = new Y.Doc();
    Y.applyUpdate(bob, baseUpdate);

    // Both edit the same paragraph concurrently while offline.
    const aBefore = Y.encodeStateVector(alice);
    (alice.getXmlFragment("prosemirror").get(0) as Y.XmlElement)
      .get(0)
      // @ts-expect-error XmlText#insert
      .insert(0, "ALICE ");
    const aliceUpdate = Y.encodeStateAsUpdate(alice, aBefore);

    const bBefore = Y.encodeStateVector(bob);
    const bobPara = bob.getXmlFragment("prosemirror").get(0) as Y.XmlElement;
    (bobPara.get(0) as Y.XmlText).insert(0, "BOB ");
    const bobUpdate = Y.encodeStateAsUpdate(bob, bBefore);

    // Server merges the two deltas — try BOTH orders.
    const mergedAB = Y.mergeUpdates([baseUpdate, aliceUpdate, bobUpdate]);
    const mergedBA = Y.mergeUpdates([baseUpdate, bobUpdate, aliceUpdate]);

    const docAB = new Y.Doc();
    Y.applyUpdate(docAB, mergedAB);
    const docBA = new Y.Doc();
    Y.applyUpdate(docBA, mergedBA);

    const textAB = fragmentToText(docAB.getXmlFragment("prosemirror"));
    const textBA = fragmentToText(docBA.getXmlFragment("prosemirror"));

    // Convergence: order of merge does not change the result.
    expect(textAB).toEqual(textBA);
    // No data loss: both offline contributions survive.
    expect(textAB).toContain("ALICE");
    expect(textAB).toContain("BOB");
    expect(textAB).toContain("Shared start");
  });

  it("is idempotent — re-applying the same update is a no-op", () => {
    const doc = makeDoc("Hello world");
    const update = Y.encodeStateAsUpdate(doc);

    const target = new Y.Doc();
    Y.applyUpdate(target, update);
    const once = fragmentToText(target.getXmlFragment("prosemirror"));
    // Applying the identical update again must not duplicate content.
    Y.applyUpdate(target, update);
    Y.applyUpdate(target, update);
    const thrice = fragmentToText(target.getXmlFragment("prosemirror"));

    expect(thrice).toEqual(once);
  });

  it("restore converges live collaborators onto the restored content", () => {
    // A live document that has drifted from an old snapshot.
    const live = makeDoc("Version two content");
    const snapshot = makeDoc("Version one content");
    const snapshotState = Y.encodeStateAsUpdate(snapshot);

    // A collaborator is synced with the live doc (shares its history).
    const collaborator = new Y.Doc();
    Y.applyUpdate(collaborator, Y.encodeStateAsUpdate(live));

    // Server-side restore: rebuild the snapshot as fresh ops on the live doc,
    // emitting only the delta (exactly what the service does).
    const before = Y.encodeStateVector(live);
    const liveFrag = live.getXmlFragment("prosemirror");
    const snapDoc = new Y.Doc();
    Y.applyUpdate(snapDoc, snapshotState);
    const src = snapDoc.getXmlFragment("prosemirror");

    live.transact(() => {
      liveFrag.delete(0, liveFrag.length);
      liveFrag.insert(
        0,
        src.toArray().map((n) => cloneXmlNode(n as Y.XmlElement | Y.XmlText))
      );
    }, "restore");

    const restoreUpdate = Y.encodeStateAsUpdate(live, before);

    // The collaborator applies just the restore delta and converges.
    Y.applyUpdate(collaborator, restoreUpdate);

    const result = fragmentToText(collaborator.getXmlFragment("prosemirror"));
    expect(result).toContain("Version one content");
    expect(result).not.toContain("Version two content");
    // Both replicas agree.
    expect(result).toEqual(fragmentToText(live.getXmlFragment("prosemirror")));
  });
});
