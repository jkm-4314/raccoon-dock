// The dash clips its icons to their resting box. Features that draw outside
// it, like magnification and the launch bounce, each hold the clip open while
// they need to, and the box gets its own clip back once none of them do.
const holds = new Map();

export function holdUnclipped(box, owner) {
  let hold = holds.get(box);
  if (!hold) {
    hold = { clip: box.clip_to_allocation, owners: new Set() };
    holds.set(box, hold);
  }
  hold.owners.add(owner);
  box.clip_to_allocation = false;
}

export function releaseUnclipped(box, owner) {
  const hold = holds.get(box);
  if (!hold?.owners.delete(owner) || hold.owners.size > 0) return;

  box.clip_to_allocation = hold.clip;
  holds.delete(box);
}
