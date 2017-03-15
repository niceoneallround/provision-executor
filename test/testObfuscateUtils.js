/*jslint node: true, vars: true */
const assert = require('assert');
const BaseSubjectPNDataModel = require('data-models/lib/BaseSubjectPNDataModel');
const BASE_P = BaseSubjectPNDataModel.PROPERTY;
const JSONLDUtils = require('jsonld-utils/lib/jldUtils').npUtils;
const obfuscateUtils = require('../lib/eitemUtils');
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_P = PNDataModel.PROPERTY;
const PN_T = PNDataModel.TYPE;
const testUtils = require('node-utils/testing-utils/lib/utils');
const util = require('util');

describe('OBFUSCATE - test obfuscate utils for obfuscation', function () {
  'use strict';

  let serviceCtx;
  let fakePai = {
      '@id': 'http://paId-1',
      [PN_P.action]: PN_T.Obfuscate, };

  before(function (done) {
    testUtils.createDummyServiceCtx({ name: 'dummyName' }, function (ctx) {
      serviceCtx = ctx;
      serviceCtx.config = testUtils.getTestServiceConfig({});
      done();
    });
  });

  describe('1 Test mapping subject to encrypt items', function () {

    it('1.1 test alice', function () {

      let schema = BaseSubjectPNDataModel.model.JSON_SCHEMA;
      let graph = { '@graph': [
        BaseSubjectPNDataModel.canons.createAlice({ domainName: serviceCtx.config.DOMAIN_NAME }),
        BaseSubjectPNDataModel.canons.createBob({ domainName: serviceCtx.config.DOMAIN_NAME }),
      ], };

      return obfuscateUtils.promises.mapData2EncryptItems(serviceCtx, graph, schema, fakePai, { msgId: 'an-id' })
        .then(function (result) {
          //console.log('*** RESULT 1.1', result);
          result.eitems.length.should.be.equal(10);
          result.eitemsMap.size.should.be.equal(10);

          for (let i = 0; i < result.eitems.length; i++) {
            result.eitems[i].should.have.property('type', fakePai['@id']);
          }
        });

    }); //it 1.1
  }); // describe 1

  describe('2 processOneSubjectMapDataToEncryptItems', function () {

    it('2.1 test just alice', function () {

      let schema = BaseSubjectPNDataModel.model.JSON_SCHEMA;
      let alice = BaseSubjectPNDataModel.canons.createAlice({ domainName: serviceCtx.config.DOMAIN_NAME });

      let result = obfuscateUtils.utils.processOneSubjectMapDataToEncryptItems(
                          serviceCtx, alice, schema, fakePai, { msgId: '1' });

      //console.log('*** RESULT 2.1', result);
      result.eitems.length.should.be.equal(5);
      result.eitemsMap.size.should.be.equal(5);

      // iterate over items making sure at high level looks ok
      for (let i = 0; i < result.eitems.length; i++) {
        result.eitems[i].should.have.property('id');
        result.eitems[i].should.have.property('v');
        result.eitems[i].should.have.property('type', fakePai['@id']);
        result.eitems[i].should.not.have.property('n');
        result.eitems[i].should.not.have.property('aad');
      }

      result.eitemsMap.forEach(function (value) {
        // should include the follwing fields
        if (value.embedKey) {
          // should be address
          value.id.should.be.equal(alice['@id']);
          value.embedKey.should.be.equal(BASE_P.address);
          value.embed.should.have.property('id', alice[BASE_P.address]['@id']);
          value.embed.key.should.be.equal(BASE_P.postalCode);
        } else {
          value.id.should.be.equal(alice['@id']);

          switch (value.key) {

            case BASE_P.givenName:
            case BASE_P.familyName:
            case BASE_P.taxID:
            case BASE_P.sourceID: {
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

  describe('3 PRIVACY_GRAPH Test creating new privacy graph from eitems', function () {

    let sourceGraph;
    let alice;
    let bob;

    before(function () {
      alice = BaseSubjectPNDataModel.canons.createAlice({ domainName: serviceCtx.config.DOMAIN_NAME });
      bob = BaseSubjectPNDataModel.canons.createBob({ domainName: serviceCtx.config.DOMAIN_NAME });
      sourceGraph = { '@graph': [alice, bob], };
    });

    it('3.1 should return zero privacy graphs if no eitems for the node', function () {

      let eitems = [];
      let eitemsMap = new Map();

      return obfuscateUtils.promises.createNodesBasedOnEitemMap(serviceCtx, eitems, eitemsMap, sourceGraph, fakePai, { msgId: 'an-id' })
        .then(function (result) {
          //console.log('*** ZERO RESULT', result);
          result.privacyGraphs.length.should.be.equal(0);
        });
    }); //it 3.1

    it('3.2 should return a privacy graph for the node if has a non embeded eitem for the node ', function () {

      let eitems = [{ id: 'ei1', result: { '@type': 'pai-id', '@value': 'cipher1', } }];
      let eitemsMap = new Map();
      eitemsMap.set('ei1', { id: alice['@id'], key: BASE_P.givenName });

      return obfuscateUtils.promises.createNodesBasedOnEitemMap(serviceCtx, eitems, eitemsMap, sourceGraph, fakePai, { msgId: 'an-id' })
        .then(function (result) {
          //console.log('*** RESULT 3.2', result);
          result.privacyGraphs.length.should.be.equal(1);

          let pg = result.privacyGraphs[0];
          pg.should.have.property('@id', alice['@id']);
          pg.should.have.property('@type');
          JSONLDUtils.isType(pg, PN_T.PrivacyGraph).should.be.equal(true, 'not a privacy graph');

          pg.should.have.property(BASE_P.givenName);
          let ov = pg[BASE_P.givenName];
          ov.should.have.property('@value', 'cipher1');
          ov.should.have.property('@type', 'pai-id');
        });
    }); //it 3.2

    it('3.3 should return a privacy graph for the node if has an embeded eitem for the node ', function () {

      let eitems = [{ id: 'ei1', result: { '@type': 'pai-id', '@value': 'cipher1', } }];
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
          JSONLDUtils.isType(pg, PN_T.PrivacyGraph).should.be.equal(true, 'not a privacy graph');

          pg.should.have.property(BASE_P.address);
          pg[BASE_P.address].should.have.property('@id');
          pg[BASE_P.address].should.have.property(BASE_P.postalCode);
          pg[BASE_P.address][BASE_P.postalCode].should.have.property('@type', 'pai-id');
          pg[BASE_P.address][BASE_P.postalCode].should.have.property('@value', 'cipher1');
        });
    }); //it 3.3

    it('3.4 should return a privacy graph for the node if has a multipe eitems for node', function () {

      let eitems = [
          { id: 'ei1', result: { '@type': 'pai-id', '@value': 'cipher1', }, },
          { id: 'ei2', result: { '@type': 'pai-id', '@value': 'cipher2', }, },
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
          JSONLDUtils.isType(pg, PN_T.PrivacyGraph).should.be.equal(true, 'not a privacy graph');

          pg.should.have.property(BASE_P.givenName);
          let ov = pg[BASE_P.givenName];
          ov.should.have.property('@value', 'cipher1');
          ov.should.have.property('@type', 'pai-id');

          pg.should.have.property(BASE_P.address);
          pg[BASE_P.address].should.have.property(BASE_P.postalCode);
          pg[BASE_P.address][BASE_P.postalCode].should.have.property('@type', 'pai-id');
          pg[BASE_P.address][BASE_P.postalCode].should.have.property('@value', 'cipher2');
        });
    }); //it 3.4

    it('3.5 should return a privacy graph for each source node if pass more than one source node and eitems for them', function () {

      let eitems = [
        { id: 'ei1', result: { '@type': 'encrypt-md-type', '@value': 'cipher', }, },
        { id: 'ei2', result: { '@type': 'encrypt-md-type', '@value': 'cipher', }, },
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

}); // describe
