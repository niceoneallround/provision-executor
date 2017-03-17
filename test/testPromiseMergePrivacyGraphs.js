/*jslint node: true, vars: true */

/*
   Note the JSONLD tests check alot of graph merge scenarios this
   just validates with a Privact Graph
*/

const PromiseMergePrivacyGraphs = require('../lib/promiseMergePrivacyGraphs').promise;
const PNDataModel = require('data-models/lib/PNDataModel');
const PN_T = PNDataModel.TYPE;
const should = require('should');

describe('1 Validate that graph merge works as expected', function () {
  'use strict';

  it('1.1 should return all subjects if all share the same type for example PriavcyGraph but should only merge on id', function () {

    const pg1 = {
      '@id': 'http://id.webshield.io/acme/com/1',
      '@type': ['https://pn.schema.webshield.io/type#Subject', PN_T.PrivacyGraph],
      'https://schema.org/givenName': 'rich',
      'https://pn.schema.webshield.io/prop#sourceID': 'a-id',
      'https://schema.org/address': {
        '@id': 'http://id.webshield.io/acme/com/address/1',
        '@type': 'https://schema.org/PostalAddress',
        'https://schema.org/postalCode': '94123',
      },
    };

    const pg2 = { // same id and type
      '@id': 'http://id.webshield.io/acme/com/1',
      '@type': ['https://pn.schema.webshield.io/type#Subject', PN_T.PrivacyGraph],
      'https://pn.schema.webshield.io/prop#sourceID': 'a-id',
      'https://schema.org/email': 'a_email',
      'https://schema.org/address': {
        '@id': 'http://id.webshield.io/acme/com/address/1',
        '@type': 'https://schema.org/PostalAddress',
        'https://schema.org/addressRegion': 'SF',
      },
    };

    const pg3 = { // different id and type
      '@id': 'http://id.webshield.io/ANOTHER/com/1',
      '@type': ['https://pn.schema.webshield.io/type#Subject_ANOTHER', PN_T.PrivacyGraph],
      'https://pn.schema.webshield.io/prop#sourceID': 'a-id2',
      'https://schema.org/email': 'a_email',
      'https://schema.org/address': {
        '@id': 'http://id.webshield.io/ANOTHER/com/address/1',
        '@type': 'https://schema.org/PostalAddress',
        'https://schema.org/addressRegion': 'SF',
      },
    };

    const graphs = { '@graph': [pg1, pg2, pg3], };

    return PromiseMergePrivacyGraphs(graphs) // embed
      .then(function (result) {
        //console.log('***Merged Privacy Graphs:%s', JSON.stringify(result, null, 2));

        result.should.not.have.property('@context');
        result.should.have.property('@graph');
        result['@graph'].length.should.be.equal(2); // should merge one subject

        let subjects =   result['@graph'];

        for (let i = 0; i < subjects.length; i++) {
          let subject = subjects[i];
          if (subject['@id'] === pg1['@id']) {
            subject.should.have.property('@id', 'http://id.webshield.io/acme/com/1');
            subject['@type'].length.should.be.equal(2);
            subject.should.have.property('https://schema.org/email');
            subject.should.have.property('https://schema.org/givenName', 'rich');
            subject.should.have.property('https://pn.schema.webshield.io/prop#sourceID', 'a-id');
            subject.should.have.property('https://schema.org/address');
            subject['https://schema.org/address'].should.have.property('@id');
            subject['https://schema.org/address'].should.have.property('https://schema.org/addressRegion', 'SF');
            subject['https://schema.org/address'].should.have.property('https://schema.org/postalCode', '94123');

          } else {
            subject.should.have.property('@id', 'http://id.webshield.io/ANOTHER/com/1');
            subject['@type'].length.should.be.equal(2);
            subject.should.have.property('https://schema.org/email', 'a_email');
            subject.should.not.have.property('https://schema.org/givenName');
            subject.should.have.property('https://pn.schema.webshield.io/prop#sourceID', 'a-id2');
            subject.should.have.property('https://schema.org/address');
            subject['https://schema.org/address'].should.have.property('@id', 'http://id.webshield.io/ANOTHER/com/address/1');
            subject['https://schema.org/address'].should.have.property('https://schema.org/addressRegion', 'SF');
            subject['https://schema.org/address'].should.not.have.property('https://schema.org/postalCode');
          }
        }
      },

      function  (err) {
        console.log('TEST-FAILED', err);
        throw err;
      });
  }); // 1.5
}); // describe 1
