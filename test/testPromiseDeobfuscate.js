/*jslint node: true, vars: true */
const assert = require('assert');
const canonProvisionJWT = require('./canonProvisionJWT');
const EKMDCanons = require('metadata/lib/encryptKeyMetadata').canons;
const JWTUtils = require('jwt-utils/lib/jwtUtils').jwtUtils;
const HttpStatus = require('http-status');
const localTestConstants = require('./constants').CONSTANTS;
const createTestConfig = require('./createTestConfig').create;
const nock = require('nock');
const should = require('should');
const testUtils = require('node-utils/testing-utils/lib/utils');
const OSCanons = require('metadata/lib/obfuscationService').canons;
const promiseDeobfuscate = require('../lib/promiseDeobfuscate').execute;
const QueryResult = require('is-utils/messages/lib/QueryResult');
const QueryPrivacyAgent = require('metadata/lib/QueryPrivacyAgent');
const util = require('util');

describe('Test Promise DeObfuscate Data', function () {
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

    // use the suject data from the canon query result
    let qpa = QueryPrivacyAgent.createTestQPA(mdProps);
    let queryResultJWT = QueryResult.createCanonJWT(dummyServiceCtx);
    let validated = QueryResult.validateJWT(dummyServiceCtx, queryResultJWT);
    let graph = { '@graph': validated.subjects, };
    let privacyPipeId = validated.privacyPipeId;
    let msgId = 'query-result-id';
    let msgAction = 'POST-QueryResult';

    // use the canon provision
    let provision = canonProvisionJWT.create(dummyServiceCtx.config, { privacyPipeId: privacyPipeId, });

    //
    // Nock out call to get the OS
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

    //
    // Nock out call to get the content key encrypt metadata
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

    //
    // Nock out the call to the Encryption Service
    //
    nock('http://test.webshield.io')
          .log(console.log)
          .defaultReplyHeaders({ 'Content-Type': 'application/json', })
          .post('/obfuscation_service/v2/decrypt')
          .reply(200, function (uri, requestBody) {
            requestBody.should.have.property('type', 'DecryptRequest');
            requestBody.should.have.property('items');
            assert((requestBody.items.length === 4), // Can only decrypt one of the result subject as from different parties and have diffrent PAI
                util.format('Encrypt service expected 4 items (4 per subject) got %s - Incorrect number of items were sent to the decrypt service?:%j',
                    requestBody.items.length, requestBody));
            return createDecryptResponse(requestBody.items);
          });

    return promiseDeobfuscate(dummyServiceCtx, qpa, provision, graph, msgId, msgAction, {})
      .then(function (result) {
        console.log(result);
      },

      function (err) {
        console.log('****here1***', err);
        throw err;
      })
      .catch(function (err) {
        console.log('****here2***', err);
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
