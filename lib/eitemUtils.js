/*jslint node: true, vars: true */

const assert = require('assert');
const JSONLDPromises = require('jsonld-utils/lib/jldUtils').promises;
const JSONLDUtilsnp = require('jsonld-utils/lib/jldUtils').npUtils;
const JSONLDUtils = require('jsonld-utils/lib/jldUtils');
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_P = PNDataModel.PROPERTY;
const PN_T = PNDataModel.TYPE;
const PNOVUtils = require('data-models/lib/PNObfuscatedValue').utils;
const util = require('util');
const uuid = require('uuid');

const loggingMD = {
        ServiceType: 'connector-utils/pstepi-executor',
        FileName: 'obfuscateUtils.js', };

let promises = {};
let callbacks = {};
let utils = {}; // expose to support testing

//---------------------------------------------

//
// mapData2EncryptItems - used for both encryption and decryption
//
// - For obfuscate the matching is just based on schema matching type.property in the target subject graphs
// - For de-obfuscate the matching is based on a combination of schema matching and the @type in the obfuscated value matching mathcin the pai to de-obfuscate
//
// Process the input graph looking for nodes and properties that need to be either
// encrypted or decrypted. Returns
//  1. an array of the encrypt item json objects, these contain { id, value, nonce, aad } and are passed to the encryption service
//  2. a map that is keyed on the encrypt item @id and allows the encrypted or decrypted item to be placed back in the object, see below
//
//
// Assumptions
//  1. Input data is an array of subjects
//
// The process in more detail is
// 0. Create a map of subject #id to subject
// 1. Find top level json-schema type property
// 2. If type is not object fail as cannot handle yet
// 3. Find the json-schema title field as this holds the JSON-LD property type
// 4. For each subject of the json-ld type perform the following - jsonld.frame() return ids of the type not copies
// 4.1 For each json-schema property that is in the subject perform the following
// 4.1.1 If type is @id or @type skip
// 4.1.2 If type is not object create an eitem for the fields and add to set of Eitems
// 4.1.2.1 If OBFUSCATE place the properties value into the encrypt item value field
// 4.1.2.2 if DEOBFUSCATE - if the values @type match's the pai['@id'] then de-obfuscate
//            by breaking the @value into its nonce, aad, and value portions and place in the encrypt item
// 4.1.3 If type is an object, callback on self passed in node and schema
// 4.2. Return array of encryption items to send to external service for either encryption or decryption
//
// An Encrypt Item has the following fields
//  - id - an id that is unique within scope of this execution and the obfuscation request
//  - type - set to the passed in value - the encrypt metadata passed to the service
//  - v - the value to encrypt
//  - n - for now set to null, may be returned by caller
//  - aad - for now set to null - can set to the @id the subject - code just knows to do this
//
// The jsonld @context is
//  - id: @id
//  - type: @type
//  - v: pn_p.v
//  - n: pn_p.n
//  - aad: pn_p.aad
//
// Returns the following
//  - array of encrypt items of format { id: , type: paiId, v:, n:<optional>, aad:<optional> }
//  - map of the form <key: eitem.id, value: mapValue> mapValue contains the following
//     - non embedded field the mapValue contains
//          { id: <object id>, key: <property name }
//     - embed object the mapValue contains
//          { id: <object id>, embedKey: <embed key name>, embed: { id: <embed object id>, key: <embed property name }}>
//
//  Example embedded mapValue
//    { id: object_d, embedKey: 'https://schema.org/address',
//         embed:{ id: embeded_object_id, key: 'https://schema.org/postaclCode' } }
//
promises.mapData2EncryptItems = function mapData2EncryptItems(serviceCtx, graph, schema, pai, props) {
  'use strict';
  return new Promise(function (resolve, reject) {
    callbacks.mapData2EncryptItems(serviceCtx, graph, schema, pai, props, function (err, result) {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

callbacks.mapData2EncryptItems = function mapData2EncryptItems(serviceCtx, graph, schema, pai, props, callback) {
  'use strict';
  assert(serviceCtx, 'mapData2EncryptItems - serviceCtx param missing');
  assert(graph, 'mapData2EncryptItems - data param missing');
  assert(schema, 'mapData2EncryptItems - schema param missing');
  assert(pai, 'mapData2EncryptItems - type param missing');
  assert(props, 'mapData2EncryptItems - props param missing');
  assert(props.msgId, 'mapData2EncryptItems - props.msgId param missing');

  assert(schema.title, util.format('No title in json schema:%j', schema));
  assert(schema.properties, util.format('No properties in json schema:%j', schema));

  serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'mapData2EncryptItems-Looking-4-Subjects',
            msgId: props.msgId, type: schema.title, paiAction: pai[PN_P.action],
            pai: pai['@id'], pai2Deobfuscate: pai[PN_P.privacyActionInstance2Deobfuscate],
            data: graph, }, loggingMD);

  let result = {};
  result.eitems = [];

  //
  // Create a map of @id to subjects - first map to an array as easier to process
  //
  let t;
  if (graph['@graph']) {
    t = graph['@graph'];
  } else if (Array.isArray(graph)) {
    t = graph;
  } else {
    t = [graph];
  }

  let id2ObjectMap = new Map();
  for (let i = 0; i < t.length; i++) {
    id2ObjectMap.set(t[i]['@id'], t[i]);
  }

  //
  // Find nodes of type schema.title in the graph
  //
  JSONLDPromises.frame(graph, schema.title, false) // false means just return @id not a copy
    .then(function (matchedNodes) {
      let subjects;
      let eitems = [];
      let eitemsMap = new Map();

      // convert so always processing an array
      if (matchedNodes['@graph']) {
        subjects = matchedNodes['@graph'];
      } else {
        subjects = [matchedNodes];
      }

      serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'mapData2EncryptItems-Found-Subjects',
                msgId: props.msgId, type: schema.title,
                paiAction: pai[PN_P.action], pai: pai['@id'], pai2Deobfuscate: pai[PN_P.privacyActionInstance2Deobfuscate],
                data: subjects, }, loggingMD);

      //
      // For each matched subject, find the object by its @id in the id2ObjectMap and pass
      // to routine to see if any fields need encrypting
      //
      let conactEitemsMap = function conactEitemsMap(value, key) {
        eitemsMap.set(key, value);
      };

      for (let i = 0; i < subjects.length; i++) {
        let object = id2ObjectMap.get(subjects[i]['@id']);
        assert(object, util.format('mapData2EncryptItems: Could not find object with id:%s in the id2ObjectMap:%j', subjects[i]['@id'], id2ObjectMap));

        let result = utils.processOneSubjectMapDataToEncryptItems(serviceCtx, object, schema, pai, { msgId: props.msgId });
        eitems = eitems.concat(result.eitems);
        result.eitemsMap.forEach(conactEitemsMap);
      }

      return callback(null, { eitems: eitems, eitemsMap: eitemsMap });
    },

    function (err) {
      serviceCtx.logger.logJSON('error', { serviceType: serviceCtx.name, action: 'mapData2EncryptItems-Found-Subjects-Frame-ERROR',
                msgId: props.msgId, type: schema.title, paiAction: pai[PN_P.action],
                pai: pai['@id'], pai2Deobfuscate: pai[PN_P.privacyActionInstance2Deobfuscate],
                err: err, }, loggingMD);

      return callback(err, null);

    });

};

//
// Process one object using the schema to look for properties that need to be encrypted or decrypted, returns an array of EItems and
// the metadata that is used map the result Eitems back into the object.
//
utils.processOneSubjectMapDataToEncryptItems = function processOneSubjectMapDataToEncryptItems(serviceCtx, object, schema, pai, props) {
  'use strict';
  assert(serviceCtx, 'processOneSubjectMapDataToEncryptItems - serviceCtx param missing');
  assert(object, 'processOneSubjectMapDataToEncryptItems - object param missing');
  assert(schema, 'processOneSubjectMapDataToEncryptItems - schema param missing');
  assert(pai, 'processOneSubjectMapDataToEncryptItems- pai param missing');
  assert(props, 'processOneSubjectMapDataToEncryptItems - props param missing');
  assert(props.msgId, 'processOneSubjectMapDataToEncryptItems- props.msgId param missing');

  serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name,
            action: 'processOneSubjectMapDataToEncryptItems-Create-values-to-encrypt-array-Start',
            msgId: props.msgId, paiAction: pai[PN_P.action],
            pai: pai['@id'], pai2Deobfuscate: pai[PN_P.privacyActionInstance2Deobfuscate],
            subjectId: object['@id'], schemaTitle: schema.title, }, loggingMD);

  let keys = Object.keys(schema.properties);
  let eitems = [];
  let eitemsMap = new Map();

  for (let i = 0; i < keys.length; i++) {

    let key = keys[i];
    let keyDesc = schema.properties[key];

    switch (key) {

      case '@id':
      case '@type': {
        //skip as for now do not obuscate these
        break;
      }

      default: {
        // ob

        if (keyDesc.type) {

          switch (keyDesc.type) {

            case 'object': {
              assert(false, 'processOneSubjectMapDataToEncryptItems - does not support object');
              break;
            }

            case 'array': {
              assert(false, 'processOneSubjectMapDataToEncryptItems - does not support array');
              break;
            }

            default: {
              // a scalar value field, if field is in the object then create
              // an encrypt item for it and record
              //
              if (object[key]) {
                serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name,
                          action: 'processOneSubjectMapDataToEncryptItems-Create-OItem',
                          msgId: props.msgId, subjectId: object['@id'], key: key, keyDesc: keyDesc,
                          paiAction: pai[PN_P.action], pai: pai['@id'],
                          pai2Deobfuscate: pai[PN_P.privacyActionInstance2Deobfuscate], }, loggingMD);

                switch (pai[PN_P.action]) {

                  case PN_T.Obfuscate: {
                    // create a json object that contains a id, the paiId and the value to encrypt.
                    // FUTURE add nonce and aad if needed.
                    let oitem = PNOVUtils.createOItem(uuid(), pai['@id'], JSONLDUtilsnp.getV(object, key));
                    eitemsMap.set(oitem.id, { id: object['@id'], key: key }); // record info needed to set encrypted value in object
                    eitems.push(oitem);
                    break;
                  }

                  case PN_T.Deobfuscate: {
                    //
                    // Only de-obfuscate the OV if its @type matches the pai[@id] that we are currently de-obfuscating for.
                    // Note the one we are de-obfuscating is recorded in a different field
                    //
                    let ov = object[key];
                    if (JSONLDUtils.isType(ov, pai[PN_P.privacyActionInstance2Deobfuscate])) {
                      let oitem = PNOVUtils.createOItemFromOV(uuid(), ov);
                      oitem.type = pai['@id']; // need to set the type to pai we are processing to decrypt a previous pai, as this is what is being executed
                      eitemsMap.set(oitem.id, { id: object['@id'], key: key }); // record info needed to set encrypted value in object
                      eitems.push(oitem);
                    }

                    break;

                  }

                  default: {
                    assert(false, 'PAI action type is not obfuscate or deobfuscate?:%j', pai);
                  }
                }
              }
            }
          } // switch key.type
        } else if (keyDesc.$ref) { // no key.type
          // process object with a ref to a schema, basically get info and recurse

          let t = keyDesc.$ref;
          let k = t.replace('#/definitions/', '');
          let embedSchema = schema.definitions[k];
          let embedObject = object[key];
          serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name,
                    action: 'processOneSubjectMapDataToEncryptItems-Embedded-Object',
                    msgId: props.msgId, subjectId: object['@id'], key: key, embedObject: embedObject, embedSchema: embedSchema,
                    paiAction: pai[PN_P.action], pai: pai['@id'], }, loggingMD);

          assert(embedObject, util.format('mapData2EncryptItems: Could not find emded object with key%s in the object:%j', key, object));
          let embeddedResult = utils.processOneSubjectMapDataToEncryptItems(
                                            serviceCtx, embedObject, embedSchema, pai, props);

          eitems = eitems.concat(embeddedResult.eitems); // conact result eitems with new eitems

          // concat the eitem map to object one - not bad to embed function but for now ok as code cleaner
          embeddedResult.eitemsMap.forEach(function (value, key1) {  // jshint ignore:line
            // embed item has to include embed key
            eitemsMap.set(key1, { id: object['@id'], embedKey: key, embed: value });
          });
        } else {
          assert(false, util.format(
            'processOneSubjectMapDataToEncryptItems - Do not know how to process key:%s with desc: %j in schema to create eitems:%j',
                      key, keyDesc, schema));
        }
      }
    }
  } // for

  return { eitems: eitems, eitemsMap: eitemsMap };
};

//
// createNodesBasedOnEitemMap
//
// Creates a new JSONLD subject object that has just the properties that are in the passed eitems maps and the corresponding eitems.
//
// The eitems map contains the node @id and any fields of that node that have either
// been obfuscated or de-obfuscated.
//
// The input eitems to build the provacy graph from are of the format
//  - id: the id to lookup the value
//  - ov: The PN Obfuscated Value to place in the privacy graph
//
//
// Assumptions
//  1. SourceGraph is an array of subjects so no need to flatten to find
//
// Performs the following
//
// Create a new skeleton JSON LD subject with just an @id and @type from the sourceSubjects
// 1. For each source node that has a type that matches the obfuscation/de-obfuscation schema type perform the following
// 1.1 create a new node
// 1.2 Copy across the @id
// 1.3 Copy across the @type
// 1.4 if OBFUSCATE add pn_t.PrivacyNode to the @type
//
// Populated the new skeleton subject as follows
// 1. Find the node by @id in the output nodes map
// 2. If !mapValue.embedKey
// 2.1 If the sourceNode[mapValue.key] is a scalar
// 2.1.1 if the sourceNode[mapValue.key] is an object or value set property to eitem
// 2.1.2 if the sourceNode[mapValue.key] is an array barf FIXME
// 2.1.3 if the sourceNode[mapValue.key] is an expanded @value then copy @type from source node value, and set @value to eitem
// 3. if mapValue.embedKey // this is a mapValue.mapValue case
// 3.1 if !newObject[mapValue.embedKey]
// 3.1.1 newObject[mapValue.embedKey] = new object with copied @id and the @type from the sourceObject[mapValue.embedKey]
// 3.2.2 if mapValue.MapValue.embedKey barf FIXME cannot handle embedded object in embedded object
// 3.2.3 if the sourceNode[mapValue.mapValue.key] is a scalar
// 2.2.3.1 if the sourceNode[mapValue.mapValue.key] is an object or value set property to eitem
// 2.2.3.2 if the sourceNode[mapValue.mapValue.key] is an array barf FIXME
// 2.2.3.3 if the sourceNode[mapValue.mapValue.keyM] is an expanded @value barf FIXME
//
promises.createNodesBasedOnEitemMap = function createNodesBasedOnEitemMap(serviceCtx, eitems, eitemsMap, sourceGraph, pai, props) {
  'use strict';
  return new Promise(function (resolve, reject) {
    callbacks.createNodesBasedOnEitemMap(serviceCtx, eitems, eitemsMap, sourceGraph, pai, props, function (err, result) {
      if (err) {
        reject(err);
      } else {
        resolve(result);
      }
    });
  });
};

callbacks.createNodesBasedOnEitemMap = function createNodesBasedOnEitemMap(serviceCtx, eitems, eitemsMap, sourceGraph, pai, props, callback) {
  'use strict';

  assert(serviceCtx, 'createNodesBasedOnEitemMap - serviceCtx param missing');
  assert(eitems, 'createNodesBasedOnEitemMap - eitems param missing');
  assert(eitemsMap, 'createNodesBasedOnEitemMap - eitemsMap param missing');
  assert(sourceGraph, 'createNodesBasedOnEitemMap - sourceGraph param missing');
  assert(pai, 'createNodesBasedOnEitemMap - pai param missing');
  assert(props, 'createNodesBasedOnEitemMap - props param missing');
  assert(props.msgId, 'createNodesBasedOnEitemMap - props.msgId param missing');

  serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'createNodesBasedOnEitemMap-START',
            msgId: props.msgId, eitemsLength: eitems.length, paiAction: pai[PN_P.action], pai: pai['@id'], }, loggingMD);

  //
  // Create a map of @id to subjects in source graph - these may be all obfuscated or all de-obfuscates subjects
  //
  let sourceSubjects;
  if (sourceGraph['@graph']) {
    sourceSubjects = sourceGraph['@graph'];
  } else if (Array.isArray(sourceGraph)) {
    sourceSubjects = sourceGraph;
  } else {
    sourceSubjects = [sourceGraph];
  }

  let sourceOM = new Map();
  for (let i = 0; i < sourceSubjects.length; i++) {
    sourceOM.set(sourceSubjects[i]['@id'], sourceSubjects[i]);
  }

  let outputSubjects = [];
  let outputSubjectsMap = new Map();

  //
  // process the array of items as described above
  //
  for (let i = 0; i < eitems.length; i++) {

    // find map value
    let mapValue = eitemsMap.get(eitems[i].id);
    assert(mapValue, util.format('NO MapValue for items:%i in map:%j', eitems[i].id, eitemsMap));

    // find source node for result eitem
    let sourceNode = sourceOM.get(mapValue.id);
    assert(sourceNode, util.format('No Source Node for @id:%s in MapValue:%j for items:%s', mapValue.id, mapValue, eitems[i].id));

    // if no output graph create one and add to set of outputs
    let outputSubject = outputSubjectsMap.get(sourceNode['@id']);
    if (!outputSubject) {
      outputSubject = { '@id': sourceNode['@id'], '@type': sourceNode['@type'] };

      if (pai[PN_P.action] === PN_T.Obfuscate) { // if obfuscate then making a Privacty Graph so mark
        JSONLDUtils.addType2Node(outputSubject, PN_T.PrivacyGraph);
      }

      outputSubjects.push(outputSubject);
      outputSubjectsMap.set(outputSubject['@id'], outputSubject);
      serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'createNodesBasedOnEitemMap-CREATE-NEW-OUTPUT-GRAPH',
                msgId: props.msgId, outputSubject: outputSubject, paiAction: pai[PN_P.action], pai: pai['@id'], }, loggingMD);
    }

    // going to populate the graph with results from either an obfuscation or a de-obfuscation.
    // this is very tied to the obfuscate/deobfuscate utils in OSW directory
    let propValue = null;
    assert(eitems[i].result, util.format('createNodesBasedOnEitemMap: item does not have a result property:%j', eitems[i]));
    propValue = eitems[i].result;

    if (!mapValue.embedKey) {

      if (sourceNode[mapValue.key]) { // if the source node contains the property

        if (Array.isArray(sourceNode[mapValue.key])) {
          assert(false, util.format('createNodesBasedOnEitemMap - Cannot handle array:%j', mapValue));
        } else {
          //
          // - FIXME If the source node properties value is already of the format ('@type', @value) then in the
          // non obfuscate case not sure how to handle @type as will get lost through the ecnrypt/decrypt. Need to track
          // - FIXME Also i feel loose information if keep envelop encrypt, as decrypt just populating the
          // v not the nonce and aad. Need to track.
          outputSubject[mapValue.key] = propValue; // normal case
        }
      } // key is in source node
    } else {
      // embedded object of the form
      // { id: object_d, embedKey: 'https://schema.org/address',
      //         embed:{ id: embeded_object_id, key: 'https://schema.org/postaclCode' } }
      let sourceEmbedNode = sourceNode[mapValue.embedKey];

      assert((sourceEmbedNode['@id'] === mapValue.embed.id),
                  util.format('Embbed node @id:%s does not match the mapVale.embed.id:%s for sourceNode:%s for mapValue:%j',
                      sourceEmbedNode['@id'], mapValue.embed.id, sourceNode['@id'], mapValue));

      // if output subject does not yet have the emedded object then create
      if (!outputSubject[mapValue.embedKey]) {
        outputSubject[mapValue.embedKey] = {
          '@id': sourceEmbedNode['@id'],
          '@type': sourceEmbedNode['@type'],
        };
      }

      if (Array.isArray(sourceEmbedNode[mapValue.embed.key])) {
        assert(false, util.format('createNodesBasedOnEitemMap - Cannot handle array:%j', mapValue));
      } else {
        //
        // - FIXME If the source node properties value is already of the format ('@type', @value) then in the
        // non obfuscate case not sure how to handle @type as will get lost through the encrypt/decrypt. Need to track
        // - FIXME Also i feel loose information if keep envelop encrypt, as decrypt just populating the
        // v not the nonce and aad. Need to track.
        outputSubject[mapValue.embedKey][mapValue.embed.key] = propValue;
      }
    }

  }

  serviceCtx.logger.logJSON('info', { serviceType: serviceCtx.name, action: 'createNodesBasedOnEitemMap-COMPLETED',
            msgId: props.msgId, paiAction: pai[PN_P.action], pai: pai['@id'], data: outputSubjects, }, loggingMD);

  return callback(null, { privacyGraphs: outputSubjects });

};

module.exports = {
  callbacks: callbacks,
  promises: promises,
  utils: utils,
};
