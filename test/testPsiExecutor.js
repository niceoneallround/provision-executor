/*jslint node: true, vars: true */
const assert = require('assert');
const psiExecutor = require('../lib/psiExecutor');
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_P = PNDataModel.PROPERTY;
const PN_T = PNDataModel.TYPE;
const testUtils = require('node-utils/testing-utils/lib/utils');
const util = require('util');

describe('PSI Test Privacy Step Instance Executor', function () {
  'use strict';

  let serviceCtx;

  before(function (done) {
    testUtils.createDummyServiceCtx({ name: 'dummyName' }, function (ctx) {
      serviceCtx = ctx;
      serviceCtx.config = testUtils.getTestServiceConfig({});
      done();
    });
  });

  describe('1 PSIE Test will execute the privacy action instance inside the privacy stepo instance', function () {

    it('1.1 Obfuscate alice and bob should produce privacy graphs of there information', function () {

      // create a privacy step instance to execute
      let psi = {};
      psi['@id'] = 'fake-psi-id';
      psi['@type'] = [PN_T.PrivacyStepInstance];
      psi[PN_P.privacyActionInstance] = [{ '@id': 'fake-pai-id', }];

      let fakePAIExecutor = {
        execute: function (serviceCtx, props) {
          assert(serviceCtx, 'serviceCtx param is missing');
          assert(props, 'props param is missing');
          assert(props.pai, util.format('props.pai param is missing:%j', props));
          return new Promise(function (resolve) {
            resolve({ '@graph': ['a', 'b'], }); // fake graph of privacy graphs
          });
        },
      };

      let psiE = psiExecutor.create({ paiExecutor: fakePAIExecutor, });

      return psiE.execute(serviceCtx, { msgId: 'msgId', psi: psi, graph: 'fake-data', os: 'fake-os', cekmd: 'fake-cekmd', })
        .then(function (result) {
          result['@graph'].length.should.be.equal(2);
        });

    }); //it 1.1
  }); // describe 1

}); // describe
