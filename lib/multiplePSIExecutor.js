/*jslint node: true, vars: true */

/**
  Apply multiple independent privacy step instances that have no order dependency to
  the same input graph, and merge the output graphs into a single result graph.

  The input graph does NOT need to be for the same entity, it can be a mix of
  subjects. The final merge of output graphs will merge subject data for the same
  subject into a single node.

  The output is a single cloned @graph containing only the nodes and properties
  that ARE included in the types and properties processed by the privacy step instances
  and privacy step instances.

  Today the most common example of this is when sending a set of syndicated
  entities down a deobfuscation privacy pipe. The syndicated entities may have
  been obfuscated by different Privacy Algorithms and hence when de-obfuscating
  more then one priavcy step instance needs to be applied to the syndicated
  entities to get the result.

*/
