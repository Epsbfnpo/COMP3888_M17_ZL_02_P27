function shortestConnections(edges, startId, targetIds) {
  if (!startId) return [];
  const adjacent = new Map();
  for (const edge of edges) {
    for (const [from,to] of [[edge.sourceId,edge.targetId],[edge.targetId,edge.sourceId]]) {
      if (!adjacent.has(from)) adjacent.set(from,[]);
      adjacent.get(from).push({to,edge});
    }
  }
  const previous = new Map([[startId,null]]);
  const queue = [startId];
  for (let i=0;i<queue.length;i++) {
    for (const step of adjacent.get(queue[i])??[]) {
      if (previous.has(step.to)) continue;
      previous.set(step.to,{from:queue[i],edge:step.edge});
      queue.push(step.to);
    }
  }
  return targetIds.map(targetId=>{
    if (!previous.has(targetId)) return {targetId,found:false,entityIds:[],relationships:[]};
    const entityIds=[targetId], relationships=[];
    let cursor=targetId;
    while (cursor!==startId) {
      const step=previous.get(cursor);
      relationships.unshift(step.edge);entityIds.unshift(step.from);cursor=step.from;
    }
    return {targetId,found:true,entityIds,relationships};
  });
}
module.exports={shortestConnections};
