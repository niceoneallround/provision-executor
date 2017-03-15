/*jslint node: true, vars: true */
const assert = require('assert');
const BaseSubjectPNDataModel = require('data-models/lib/BaseSubjectPNDataModel');
const BASE_P = BaseSubjectPNDataModel.PROPERTY;
const BASE_T = BaseSubjectPNDataModel.TYPE;
const JSONLDUtils = require('jsonld-utils/lib/jldUtils').npUtils;
const EKMDCanons = require('metadata/lib/encryptKeyMetadata').canons;
const localTestCanons = require('./utils').canons;
const HttpStatus = require('http-status');
const nock = require('nock');
const OSCanons = require('metadata/lib/obfuscationService').canons;
const paiExecutor = require('../lib/paiExecutor');
const PAIUtils = require('metadata/lib/PrivacyActionInstance').utils;
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_P = PNDataModel.PROPERTY;
const PN_T = PNDataModel.TYPE;
const PNOVUtils = require('data-models/lib/PNObfuscatedValue').utils;
const testUtils = require('node-utils/testing-utils/lib/utils');
const util = require('util');

describe('PAI Test Privacy Action Instance Executor', function () {
  'use strict';

  let serviceCtx;

  before(function (done) {
    testUtils.createDummyServiceCtx({ name: 'dummyName' }, function (ctx) {
      serviceCtx = ctx;
      serviceCtx.config = testUtils.getTestServiceConfig({});
      done();
    });
  });

  describe('1 Ensure can OBFUSCATE data to a privacy graph - note lower levels check results so do not repeat', function () {

    it('1.1 Obfuscate alice and bob should produce privacy graphs of there information', function () {

      let schema = BaseSubjectPNDataModel.model.JSON_SCHEMA;
      let graph = { '@graph': [
        BaseSubjectPNDataModel.canons.createAlice({ domainName: serviceCtx.config.DOMAIN_NAME }),
        BaseSubjectPNDataModel.canons.createBob({ domainName: serviceCtx.config.DOMAIN_NAME }),
      ], };

      // create a privacy action instance to execute
      let props1 = { hostname: 'fake.hostname', domainName: 'fake.com', pa: 'fake.pa' };

      let paiYAML = {
        id: 'privacy-action-instance-1',
        privacy_action: 'action-1-id',
        obfuscation_service: 'fake.os.id',
        skip_orchestration: false,
        action: 'obfuscate',
        schema: schema,
        encrypt_key_md_jwt: 'keymd_jwt',
      };

      let pai = PAIUtils.YAML2Node(paiYAML, props1);
      assert(JSONLDUtils.isType(pai, PN_T.PrivacyActionInstance), util.format('Expected type PrivacyActionInstance:%j', pai));

      // nock out call to the obfuscation service
      nock('http://test.webshield.io')
            .log(console.log)
            .defaultReplyHeaders({ 'Content-Type': 'application/json', })
            .post('/obfuscation_service/v2/encrypt')
            .reply(HttpStatus.OK, function (uri, requestBody) {
              requestBody.should.have.property('type', 'EncryptRequest');
              return localTestCanons.encryptResponse(requestBody.items);
            });

      let props = { graph: graph,
                pai: pai,
                msgId: '1',
                os: OSCanons.createTestObfuscationService(props1),
                cekmd: EKMDCanons.createTestKey(props1), };
      return paiExecutor.promises.execute(serviceCtx, props)
        .then(function (result) {
          let pgs = result['@graph'];
          pgs.length.should.be.equal(2);

          for (let i = 0; i < pgs.length; i++) {
            let pg = pgs[i];

            // perform some basic check as lower levels are already tested
            assert(JSONLDUtils.isType(pg, PN_T.PrivacyGraph), util.format('Expected type Privacy Graph:%j', pg));
            pg.should.have.property('https://schema.org/givenName');
            pg['https://schema.org/givenName'].should.have.property('@type', pai['@id']);
            pg['https://schema.org/givenName'].should.have.property('@value');
          }
        });

    }); //it 1.1
  }); // describe 1

  describe('2 Ensure can DEOBFUSCATE - note lower levels check results so do not repeat', function () {

    it('2.1 DeObfuscate alice and bob privacy graphs should produce output graphs with just the fields that can be de-obfuscated', function () {

      // create the deobfuscate PAI
      let schema = BaseSubjectPNDataModel.model.JSON_SCHEMA;
      let paiYAML = {
        id: 'privacy-action-instance-1',
        privacy_action: 'action-1-id',
        obfuscation_service: 'fake.os.id',
        skip_orchestration: false,
        action: 'deobfuscate',
        privacy_action_instance_2_deobfuscate: 'http://pai-2-deobfuscate-id',
        privacy_pipe_2_deobfuscate: 'http://dont-care-pipe',
        schema: schema,
        encrypt_key_md_jwt: 'keymd_jwt',
      };

      let props1 = { hostname: 'fake.hostname', domainName: 'fake.com', pa: 'fake.pa' };
      let pai = PAIUtils.YAML2Node(paiYAML, props1);
      console.log(pai);
      assert(JSONLDUtils.isType(pai, PN_T.PrivacyActionInstance), util.format('Expected type PrivacyActionInstance:%j', pai));

      // create the data to de-obfuscate
      let alice = BaseSubjectPNDataModel.canons.createAlice({ domainName: serviceCtx.config.DOMAIN_NAME });
      setSomeSubjectProperties2OV(alice);
      let bob = BaseSubjectPNDataModel.canons.createBob({ domainName: serviceCtx.config.DOMAIN_NAME });
      setSomeSubjectProperties2OV(bob);
      let graph = { '@graph': [alice, bob], };

      // nock out call to the obfuscation service
      nock('http://test.webshield.io')
            .log(console.log)
            .defaultReplyHeaders({ 'Content-Type': 'application/json', })
            .post('/obfuscation_service/v2/decrypt')
            .reply(HttpStatus.OK, function (uri, requestBody) {
              requestBody.should.have.property('type', 'DecryptRequest');
              return localTestCanons.decryptResponse(requestBody.items);
            });

      let props = { graph: graph,
                pai: pai,
                msgId: '2',
                os: OSCanons.createTestObfuscationService(props1),
                cekmd: EKMDCanons.createTestKey(props1), };
      return paiExecutor.promises.execute(serviceCtx, props)
        .then(function (result) {
          let pgs = result['@graph'];
          pgs.length.should.be.equal(2);

          for (let i = 0; i < pgs.length; i++) {
            let pg = pgs[i];

            // perform some basic check as lower levels are already tested
            pg.should.have.property('@id');
            assert(JSONLDUtils.isType(pg, BASE_T.Subject), util.format('Expected type:%s :%j', BASE_T.Subject, pg));

            pg.should.have.property(BASE_P.givenName, 'clear-text-cipher-value');
            pg.should.have.property(BASE_P.familyName, 'clear-text-cipher-value');
            pg.should.have.property(BASE_P.address);
            pg[BASE_P.address].should.have.property(BASE_P.postalCode, 'clear-text-cipher-value');

            // was not an encrypted property, although in schema to de-obfuscate
            pg.should.not.have.property(BASE_P.taxID);
          }
        });

      // utility function to create some obfuscated values
      function setSomeSubjectProperties2OV(subject) {

        let type = pai[PN_P.privacyActionInstance2Deobfuscate];
        let value = Buffer.from('cipher-value').toString('base64');
        subject[BASE_P.givenName] = PNOVUtils.createOVFromOItem({ type: type, v: value, });
        subject[BASE_P.familyName] = PNOVUtils.createOVFromOItem({ type: type, v: value, });
        subject[BASE_P.address][BASE_P.postalCode] = PNOVUtils.createOVFromOItem({ type: type, v: value, });

      }

    }); //it 2.1
  }); // describe 2

}); // describe
