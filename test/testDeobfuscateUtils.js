/*jslint node: true, vars: true */

//
// Test processing a set of subjects for deobfuscation. The output should be
// a set of oitems that represent the fields needed to be decrypted
//

/*jslint node: true, vars: true */
const assert = require('assert');
const BaseSubjectPNDataModel = require('data-models/lib/BaseSubjectPNDataModel');
const BASE_P = BaseSubjectPNDataModel.PROPERTY;
const JSONLDUtils = require('jsonld-utils/lib/jldUtils').npUtils;
const obfuscateUtils = require('../lib/eitemUtils');
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_P = PNDataModel.PROPERTY;
const PN_T = PNDataModel.TYPE;
const PNOVUtils = require('data-models/lib/PNObfuscatedValue').utils;
const testUtils = require('node-utils/testing-utils/lib/utils');
const util = require('util');

describe('DEOBFUSCATE - test obfuscate utils for deobfuscation', function () {
  'use strict';

  let serviceCtx;
  let fakePai = {
      '@id': 'http://paId-1',
      [PN_P.action]: PN_T.Deobfuscate,
      [PN_P.privacyActionInstance2Deobfuscate]: 'http://pai-2-deob-id', };

  before(function (done) {
    testUtils.createDummyServiceCtx({ name: 'dummyName' }, function (ctx) {
      serviceCtx = ctx;
      serviceCtx.config = testUtils.getTestServiceConfig({});
      done();
    });
  });

  describe('1 Test mapping subject to eitems for deobfuscation', function () {

    it('1.1 should find all the obfuscated values that match the paiId and return a array of eitems for them and a map', function () {

      let schema = BaseSubjectPNDataModel.model.JSON_SCHEMA;
      let alice = BaseSubjectPNDataModel.canons.createAlice({ domainName: serviceCtx.config.DOMAIN_NAME });
      setSomeSubjectProperties2OV(alice);
      let bob =   BaseSubjectPNDataModel.canons.createBob({ domainName: serviceCtx.config.DOMAIN_NAME });
      setSomeSubjectProperties2OV(bob);

      let graph = { '@graph': [alice, bob] };

      return obfuscateUtils.promises.mapData2EncryptItems(serviceCtx, graph, schema, fakePai, { msgId: 'an-id' })
        .then(function (result) {
          console.log('*** RESULT 1.1', result);
          result.eitems.length.should.be.equal(6);
          result.eitemsMap.size.should.be.equal(6);

          for (let i = 0; i < result.eitems.length; i++) {
            result.eitems[i].should.have.property('id');
            result.eitems[i].should.have.property('v', 'v1');
            result.eitems[i].should.have.property('n', 'n1');
            result.eitems[i].should.have.property('type', fakePai['@id']);
            result.eitems[i].should.not.have.property('aad');
          }
        });

    }); //it 1.1
  }); // describe 1

  describe('2 processOneSubjectMapDataToEncryptItems', function () {

    it('2.1 test just alice', function () {

      let schema = BaseSubjectPNDataModel.model.JSON_SCHEMA;
      let alice = BaseSubjectPNDataModel.canons.createAlice({ domainName: serviceCtx.config.DOMAIN_NAME });
      setSomeSubjectProperties2OV(alice);

      let result = obfuscateUtils.utils.processOneSubjectMapDataToEncryptItems(
                          serviceCtx, alice, schema, fakePai, { msgId: '1' });

      //console.log('*** RESULT 2.1', result);
      result.eitems.length.should.be.equal(3);
      result.eitemsMap.size.should.be.equal(3);

      // iterate over items making sure at high level looks ok
      for (let i = 0; i < result.eitems.length; i++) {
        result.eitems[i].should.have.property('id');
        result.eitems[i].should.have.property('v', 'v1');
        result.eitems[i].should.have.property('n', 'n1');
        result.eitems[i].should.have.property('type', fakePai['@id']);
        result.eitems[i].should.not.have.property('aad');
      }

      // lets look at the details
      result.eitemsMap.forEach(function (value) {
        // should include the following field

        value.id.should.be.equal(alice['@id']);

        if (value.embedKey) {
          // should be address
          value.embedKey.should.be.equal(BASE_P.address);
          value.embed.should.have.property('id', alice[BASE_P.address]['@id']);
          value.embed.key.should.be.equal(BASE_P.postalCode);
        } else {
          switch (value.key) {

            case BASE_P.givenName:
            case BASE_P.familyName: {
              break;
            }

            default: {
              assert(false, util.format('Did not expect a map item for key:%s', value.key));
            }
          }
        }
      });

    }); //it 2.1
  }); // describe 2

  describe('3 Test creating output graphs from deobfuscation eitems', function () {

    let sourceGraph;
    let alice;
    let bob;

    before(function () {
      alice = BaseSubjectPNDataModel.canons.createAlice({ domainName: serviceCtx.config.DOMAIN_NAME });
      setSomeSubjectProperties2OV(alice);
      bob = BaseSubjectPNDataModel.canons.createBob({ domainName: serviceCtx.config.DOMAIN_NAME });
      setSomeSubjectProperties2OV(bob);
      sourceGraph = { '@graph': [alice, bob], };
    });

    it('3.1 should return zero output graphs if no eitems for the node', function () {

      let eitems = [];
      let eitemsMap = new Map();

      return obfuscateUtils.promises.createNodesBasedOnEitemMap(serviceCtx, eitems, eitemsMap, sourceGraph, fakePai, { msgId: 'an-id' })
        .then(function (result) {
          //console.log('*** ZERO RESULT', result);
          result.privacyGraphs.length.should.be.equal(0);
        });
    }); //it 3.1

    it('3.2 should return an ouput graph with deobfuscated value for the node if has a non embeded eitem for the node ', function () {

      let eitems = [{ id: 'ei1', result: 'clear-text' }];
      let eitemsMap = new Map();
      eitemsMap.set('ei1', { id: alice['@id'], key: BASE_P.givenName });

      return obfuscateUtils.promises.createNodesBasedOnEitemMap(serviceCtx, eitems, eitemsMap, sourceGraph, fakePai, { msgId: 'an-id' })
        .then(function (result) {
          //console.log('*** RESULT 3.2', result);
          result.privacyGraphs.length.should.be.equal(1);

          let subject = result.privacyGraphs[0];
          subject.should.have.property('@id', alice['@id']);
          subject.should.have.property('@type');
          JSONLDUtils.isType(subject, PN_T.PrivacyGraph).should.not.be.equal(true, 'not a privacy graph');

          subject.should.have.property(BASE_P.givenName, 'clear-text');
        });
    }); //it 3.2

    it('3.3 should return an output graph for the node if has an embeded eitem for the node ', function () {

      let eitems = [{ id: 'ei1', result: 'cleat-text' }];
      let eitemsMap = new Map();
      console.log('3.3 ALICE: %j', alice);
      eitemsMap.set('ei1', { id: alice['@id'], embedKey: BASE_P.address,
                              embed: { id: alice[BASE_P.address]['@id'], key: BASE_P.postalCode, }, });

      return obfuscateUtils.promises.createNodesBasedOnEitemMap(serviceCtx, eitems, eitemsMap, sourceGraph, fakePai, { msgId: 'an-id' })
        .then(function (result) {
          //console.log('*** RESULT 3.3', result);
          result.privacyGraphs.length.should.be.equal(1);

          let pg = result.privacyGraphs[0];
          pg.should.have.property('@id', alice['@id']);
          pg.should.have.property('@type');
          JSONLDUtils.isType(pg, PN_T.PrivacyGraph).should.not.be.equal(true, 'not a privacy graph');

          pg.should.have.property(BASE_P.address);
          pg[BASE_P.address].should.have.property('@id');
          pg[BASE_P.address].should.have.property(BASE_P.postalCode, 'cleat-text');
        });
    }); //it 3.3

    it('3.4 should return an output graph for the node if has a multipe eitems for node', function () {

      let eitems = [
          { id: 'ei1', result: 'clear-text1', },
          { id: 'ei2', result: 'cleat-text2', },
        ];
      let eitemsMap = new Map();
      eitemsMap.set('ei1', { id: alice['@id'], key: BASE_P.givenName });
      eitemsMap.set('ei2', { id: alice['@id'], embedKey: BASE_P.address,
                              embed: { id: alice[BASE_P.address]['@id'], key: BASE_P.postalCode, }, });

      return obfuscateUtils.promises.createNodesBasedOnEitemMap(serviceCtx, eitems, eitemsMap, sourceGraph, fakePai, { msgId: 'an-id' })
        .then(function (result) {
          //console.log('*** RESULT 3.4', result);
          result.privacyGraphs.length.should.be.equal(1);

          let pg = result.privacyGraphs[0];
          pg.should.have.property('@id', alice['@id']);
          pg.should.have.property('@type');
          JSONLDUtils.isType(pg, PN_T.PrivacyGraph).should.not.be.equal(true, 'not a privacy graph');

          pg.should.have.property(BASE_P.givenName, 'clear-text1');

          pg.should.have.property(BASE_P.address);
          pg[BASE_P.address].should.have.property(BASE_P.postalCode, 'cleat-text2');
        });
    }); //it 3.4

    it('3.5 should return a output graph for each source node if pass more than one source node and eitems for them', function () {

      let eitems = [
        { id: 'ei1', result: 'clear-text', },
        { id: 'ei2', result: 'clear-text', },
      ];
      let eitemsMap = new Map();
      eitemsMap.set('ei1', { id: alice['@id'], key: BASE_P.givenName });
      eitemsMap.set('ei2', { id: bob['@id'], key: BASE_P.givenName });

      return obfuscateUtils.promises.createNodesBasedOnEitemMap(serviceCtx, eitems, eitemsMap, sourceGraph, fakePai, { msgId: 'an-id' })
        .then(function (result) {
          //console.log('*** RESULT 3.5', result);
          result.privacyGraphs.length.should.be.equal(2);
          result.privacyGraphs[0]['@id'].should.not.be.equal(result.privacyGraphs[1]['@id']);
        });
    }); //it 3.5

  }); // describe 3

  //-----------------
  // Utility routines
  //------------------

  function setSomeSubjectProperties2OV(subject) {
    //
    // Convert Three of alices properties into OV values so the process will find them and convert to Oitems
    // Do not care what the nonce and value are so make all the same as easier to check
    //
    subject[BASE_P.givenName] = PNOVUtils.createOVFromOItem(
                { type: fakePai[PN_P.privacyActionInstance2Deobfuscate], v: 'v1', n: 'n1', });

    subject[BASE_P.familyName] = PNOVUtils.createOVFromOItem(
                { type: fakePai[PN_P.privacyActionInstance2Deobfuscate], v: 'v1', n: 'n1', });

    // add an embedded object
    subject[BASE_P.address][BASE_P.postalCode] = PNOVUtils.createOVFromOItem(
                { type: fakePai[PN_P.privacyActionInstance2Deobfuscate], v: 'v1', n: 'n1', });

  }

}); // describe
