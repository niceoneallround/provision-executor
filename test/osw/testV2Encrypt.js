/*jslint node: true, vars: true */
const assert = require('assert');
const nock = require('nock');
const HttpStatus = require('http-status');
const v2Encrypt = require('../../lib/osw/v2Encrypt');
const EKMDCanons = require('metadata/lib/encryptKeyMetadata').canons;
const OSCanons = require('metadata/lib/obfuscationService').canons;
const PNOVUtils = require('data-models/lib/PNObfuscatedValue').utils;
const PSICanons = require('metadata/lib/PrivacyStepInstance').canons;
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_P = PNDataModel.PROPERTY;
const should = require('should');
const testUtils = require('node-utils/testing-utils/lib/utils');
const localTestCanons = require('../utils').canons;
const util = require('util');

describe('v2Encrypt - tests', function () {
  'use strict';

  let dummyServiceCtx;
  let pstepI = PSICanons.createObfuscatePrivacyStepI({ hostname: 'hostname', domainName: 'domainName', });

  let props = {};
  props.msgId = 'msgId1';
  props.os = OSCanons.createTestObfuscationService({ hostname: 'hostname', domainName: 'domainName', });
  props.pai = pstepI[PN_P.privacyActionInstance][0]; // set to canon privacy action instance
  props.cekmd = EKMDCanons.createTestKey({ hostname: 'hostname', domainName: 'domainName', });

  //console.log(props.pai);

  let items = [];
  items.push(PNOVUtils.createOItem('id1', 'type1', 'value1'));
  items.push(PNOVUtils.createOItem('id2', 'type2', 'value2'));

  before(function (done) {
    let props = {};
    props.name = 'test1';
    testUtils.createDummyServiceCtx(props, function (ctx) {
      dummyServiceCtx = ctx;
      dummyServiceCtx.config = testUtils.getTestServiceConfig(
          { port: '2325',
            DOMAIN_NAME: 'test.webshield.io', });
      done();
    });
  });

  describe('1 validate create compact request', function () {

    it('1.1 should return a promise that contains the compacted request', function () {
      return v2Encrypt.model.promiseCompactEncryptRequest(dummyServiceCtx, items, props)
        .then(function (result) {
          console.log('*******', result);
          result.should.have.property('@context');
          result.should.have.property('id');
          result.should.have.property('type', 'EncryptRequest');
          result.should.have.property('encryption_metadata');
          result.should.have.property('items');

          result.encryption_metadata.should.have.property('id');
          result.encryption_metadata.should.have.property('type', 'EncryptMetadata');
          result.encryption_metadata.should.have.property('obfuscation_provider');
          result.encryption_metadata.should.have.property('content_obfuscation_algorithm', 'A256GCM');
          result.encryption_metadata.should.have.property('content_encrypt_key_md');
          result.encryption_metadata.should.have.property('content_encrypt_key_md_jwt');
          result.encryption_metadata.should.not.have.property('kms');

          let cekmd = result.encryption_metadata.content_encrypt_key_md;
          cekmd.should.have.property('id');
          cekmd.should.have.property('type');
          cekmd.should.have.property('raw_encrypt_key_md_type', 'jsonwebkey');
          cekmd.should.have.property('raw_encrypt_key_md');

          //console.log('*******', result.items);

          for (let i = 0; i < result.items.length; i++) {
            console.log(items[i]);
            result.items[i].should.have.property('id');
            result.items[i].should.have.property('type');
            result.items[i].should.have.property('v');
          }
        });
    }); //it 1.1
  }); // describe 1

  describe('2 execute encryption', function () {

    it('2.1 should return a promise that contains the encrypted items', function () {
      //
      // Nock out the call to the obfuscation service that is in the canon
      //
      // nock out the GET for the home document

      nock('http://test.webshield.io')
            .log(console.log)
            .defaultReplyHeaders({ 'Content-Type': 'application/json', })
            .post('/obfuscation_service/v2/encrypt')
            .reply(HttpStatus.OK, function (uri, requestBody) {
              //requestBody.should.be.equal(jwtM);
              this.req.headers.should.have.property('content-type', 'application/json');
              uri.should.equal('/obfuscation_service/v2/encrypt');
              assert(requestBody, util.format('no request request body:%j', requestBody));

              //console.log('****', requestBody);
              requestBody.should.have.property('type', 'EncryptRequest');

              // check expaned key information
              requestBody.encryption_metadata.length.should.be.equal(1);

              let cekmd = requestBody.encryption_metadata[0].content_encrypt_key_md;
              cekmd.should.have.property('id');
              cekmd.should.have.property('type');
              cekmd.should.have.property('raw_encrypt_key_md_type', 'jsonwebkey');
              cekmd.should.have.property('raw_encrypt_key_md');
              cekmd.raw_encrypt_key_md.should.have.property('kty');
              cekmd.raw_encrypt_key_md.should.have.property('alg');
              cekmd.raw_encrypt_key_md.should.have.property('k');

              return localTestCanons.encryptResponse(requestBody.items);
            });

      let promiseResult = v2Encrypt.execute(dummyServiceCtx, items, props);
      return promiseResult.then(function (result) {
        result.should.have.property('@graph');
        let items = result['@graph'];
        items.length.should.equal(2);
        items[0].should.have.property('id', 'id1');
        items[0].should.have.property('result');
        items[0].result.should.have.property('@type', props.pai['@id']);
        items[0].result.should.have.property('@value');
        items[1].should.have.property('id', 'id2');
        items[1].should.have.property('result');
        items[1].result.should.have.property('@type', props.pai['@id']);
        items[1].result.should.have.property('@value');
      });
    }); //it 2.1
  }); // describe 2

}); // describe
