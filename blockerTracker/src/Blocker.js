function changeStatus(status, note) {
  var now = DateTime.now();
  var current = BlockerStatusChange.fetch({
    filter: Filter.eq('blocker', this.id).and().not().exists('endedAt'),
  }).objs;

  BlockerStatusChange.mergeBatch(
    current.map(function (change) {
      return change.withEndedAt(now);
    })
  );
  return BlockerStatusChange.make({ blocker: this, status: status, changedAt: now, note: note }).create();
}
