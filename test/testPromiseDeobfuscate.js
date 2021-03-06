/*jslint node: true, vars: true */
const assert = require('assert');
const EKMDCanons = require('metadata/lib/encryptKeyMetadata').canons;
const JSONLDUtils = require('jsonld-utils/lib/jldUtils').npUtils;
const JWTUtils = require('jwt-utils/lib/jwtUtils').jwtUtils;
const HttpStatus = require('http-status');
const localTestConstants = require('./constants').CONSTANTS;
const createTestConfig = require('./createTestConfig').create;
const nock = require('nock');
const should = require('should');
const testUtils = require('node-utils/testing-utils/lib/utils');
const OSCanons = require('metadata/lib/obfuscationService').canons;
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_P = PNDataModel.PROPERTY;
const ProvisionCanons = require('metadata/lib/provision').canons;
const promiseDeobfuscate = require('../lib/promiseDeobfuscate').execute;
const QueryResult = require('is-utils/messages/lib/QueryResult');
const QueryPrivacyAgent = require('metadata/lib/QueryPrivacyAgent');
const util = require('util');

describe('Test Promise DeObfuscate Data using Two Provisions', function () {
  'use strict';

  let dummyServiceCtx;

  let config = createTestConfig({
                  LISTEN_PORT: '8083', });

  // used when creating metadata
  let mdProps = { hostname: 'fake.hostname', domainName: 'fake.com',
                  issuer: 'theIssuer', creationTime: 'createTime', };

  before(function (done) {
    let props = {};
    props.name = 'fake-name';
    testUtils.createDummyServiceCtx(props, function (ctx) {
      dummyServiceCtx = ctx;
      dummyServiceCtx.config = config;
      done();
    });
  });

  it('1.1 should apply provision step to the passed in graph ', function () {

    // use the suject data from the canon query result as these has subjects from
    // the syndicate request canon and the RS query result canon
    //
    let qpa = QueryPrivacyAgent.createTestQPA(mdProps);
    let queryResultJWT = QueryResult.createCanonJWT(dummyServiceCtx);
    let validated = QueryResult.validateJWT(dummyServiceCtx, queryResultJWT);
    let graph = { '@graph': validated.subjects, };
    let privacyPipeId = validated.privacyPipeId;
    let msgId = 'query-result-id';
    let msgAction = 'POST-QueryResult';

    console.log('***SUBJECTS PROCESSING:%s', JSON.stringify(validated.subjects, null, 2));

    let provisionProps = { domainName: config.DOMAIN_NAME, hostname: config.getHostname(), privacyPipeId: privacyPipeId, };

    // create a provision for JUST deobfuscate the syndicate request
    let provision = ProvisionCanons.createDebofuscateIngestPASubjectsProvision(provisionProps);
    let provisionedMD = JSONLDUtils.getArray(provision, PN_P.provisionedMetadata);
    assert((provisionedMD.length === 1),
            util.format('provisionMetadata should have 1 and only 1 metadata:%j', provision));

    // create a provision for the JUST deobfuscate the reference source results
    // and then extact the metadata and add to the above provision PN_P.provisionmetadata
    // so now two metadatas to apply
    let tmpProvision = ProvisionCanons.createDebofuscateReferenceSourceSubjectsProvision(provisionProps);
    let tmpProvisionedMD = JSONLDUtils.getArray(tmpProvision, PN_P.provisionedMetadata);
    assert((tmpProvisionedMD.length === 1),
            util.format('provisionMetadata should have 1 and only 1 metadata:%j', tmpProvision));

    // extract provisioned PSI for deob rs subjects and put in original provision
    let rsPSI = tmpProvisionedMD[0];
    provision[PN_P.provisionedMetadata].push(rsPSI);

    //
    // Nock out the TWO calls to get the OS one for each PSI that needs to be de-obfuscated
    // they both use the same OS
    //
    let ospathUrl = '/v1/metadata/obfuscation_service___io___webshield___test___query___local--os-test-private-1';
    nock(localTestConstants.API_GATEWAY_URL)
          .log(console.log)
          .get(ospathUrl)
          .reply(function () { // not used uri, requestBody) {
            return [
              HttpStatus.OK,
              createMDJWT(OSCanons.createTestObfuscationService(mdProps)),
              { 'content-type': 'text/plain', },
            ];
          });

    nock(localTestConstants.API_GATEWAY_URL)
          .log(console.log)
          .get(ospathUrl)
          .reply(function () { // not used uri, requestBody) {
            return [
              HttpStatus.OK,
              createMDJWT(OSCanons.createTestObfuscationService(mdProps)),
              { 'content-type': 'text/plain', },
            ];
          });

    //
    // Nock out the TWO calls to get the content key encrypt metadata for each PSI they both use the same KEY
    //
    let ekmdpathUrl = '/v1/metadata/encrypt_key_md___io___webshield___test___dc--content-key-1';
    nock(localTestConstants.API_GATEWAY_URL)
          .log(console.log)
          .get(ekmdpathUrl)
          .reply(function () { // not used uri, requestBody) {
            return [
              HttpStatus.OK,
              createMDJWT(EKMDCanons.createTestKey(mdProps)),
              { 'content-type': 'text/plain', },
            ];
          });

    nock(localTestConstants.API_GATEWAY_URL)
          .log(console.log)
          .get(ekmdpathUrl)
          .reply(function () { // not used uri, requestBody) {
            return [
              HttpStatus.OK,
              createMDJWT(EKMDCanons.createTestKey(mdProps)),
              { 'content-type': 'text/plain', },
            ];
          });

    //
    // Nock out the TWO call to the Encryption Service to decrypt - treat as the same
    //
    nock('http://test.webshield.io')
          .log(console.log)
          .defaultReplyHeaders({ 'Content-Type': 'application/json', })
          .post('/obfuscation_service/v2/decrypt')
          .reply(200, function (uri, requestBody) {
            console.log('*****here1', requestBody);
            requestBody.should.have.property('type', 'DecryptRequest');
            requestBody.should.have.property('items');
            return createDecryptResponse(JSONLDUtils.getArray(requestBody, 'items'));
          });

    nock('http://test.webshield.io')
          .log(console.log)
          .defaultReplyHeaders({ 'Content-Type': 'application/json', })
          .post('/obfuscation_service/v2/decrypt')
          .reply(200, function (uri, requestBody) {
            console.log('*****here2', requestBody);
            requestBody.should.have.property('type', 'DecryptRequest');
            requestBody.should.have.property('items');
            return createDecryptResponse(JSONLDUtils.getArray(requestBody, 'items'));
          });

    return promiseDeobfuscate(dummyServiceCtx, qpa, provision, graph, 'set-in-test-pipeId', msgId, msgAction, {})
      .then(function (result) {
        //console.log('***TEST_RESULT', result);
        //console.log('***TEST_RESULT_DATA', result.data);
        result.should.have.property('data');
        result.data.should.have.property('@graph');
        result.data['@graph'].length.should.be.equal(2, 'Should only contain both deobfuscated syndicate request subject and rs query result subjects');
        result.should.have.property('os');
        result.os.length.should.be.equal(2, 'should return 2 os metadatas, even though the same');
      },

      function (err) {
        console.log('*****TEST-FAILED', err);
        throw err;
      })
      .catch(function (err) {
        console.log('***TEST-FAILED-UNEXPECTED-ERROR', err);
        throw err;
      });
  }); //it 1.1

  //--------
  // helpers
  //---------

  function createMDJWT(md) {
    return JWTUtils.signMetadata(md, dummyServiceCtx.config.crypto.jwt, { subject: md['@id'] });
  }

  /*
    Create a canon V2 Decrypt Response
  */
  function createDecryptResponse(inputItems) {
    assert(inputItems, 'DecryptCanon.create  inputItems missing');
    assert((inputItems.length !== 0), util.format('DecryptCanon.create NO ITEMS TO DECRYPT???:%j', inputItems));

    let canonRsp = {
      id: '_:1',
      type: 'DecryptResponse',
      responding_to: 'response-id',
      items: [], };

    for (let j = 0; j < inputItems.length; j++) {
      canonRsp.items.push({
        id: inputItems[j].id,
        type: inputItems[j].type,
        v: Buffer.from('clear-text-' + j).toString('base64'),
      });
    }

    return canonRsp;
  }

}); // describe
