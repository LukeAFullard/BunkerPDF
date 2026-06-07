function findClosestItem(items, x, y) {
  let closest = null;
  let minDistance = Infinity;

  for (const item of items) {
    // Check if point is inside bounding box with tolerance
    if (
        x >= item.x - 2 &&
        x <= item.x + item.width + 2 &&
        y >= item.y - 2 &&
        y <= item.y + item.height + 2
    ) {
      return item; // Returns the first one found!
    }
  }
}
