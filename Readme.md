#KN

    A port of Brian Romanowski's Java-based open source Kneser-Ney language model, according to Chen and Goodman's kneser-ney-mod-fix
    description, to nodejs using the 'natural' npm package.

##Usage [usage]

    var kn = require('../lib/kn'),
        _ = require('underscore'),
        NGramCountModel = kn.NGramCountModel,
        KneserNeyModFixModel2 = kn.KneserNeyModFixModel2,
        NGram = kn.NGram;

    // training is an array of strings (do not feed <s> </s> sentence delimiters, no '.')
    var ngcm = new NGramCountModel();
    for (var t=0;t<training.length;t++) ngcm.populate(training[t]);

    var kn = new KneserNeyModFixModel2(ngcm);
    var backoff = kn.calcBackoff();

    // create an bigram, you have to use indices from the count model (if they are there)
    var test = new NGram([ ngcm.index['i'], ngcm.index['have'] ]);

    // find any matching trigrams and their probability
    var hashes = backoff.forwardLookup[test.hash()];

    // need a way to print ngrams, yeah, should probably be 'in' NGram
    var printWords = function(ngram, index){
        var str = '';
        _.each(ngram.keys,function(key){
            str += index[key]+' ';
        });
        return str;
    };

    // print out the results
    _.each(hashes,function(h){

        // in this case, the input is a bigram, output is a trigram (stored in highOrderNGrams)
        console.log('\tmatch:',printWords(backoff.highOrderNGrams[h]));
    });

##Note

    Brian Romanowski's Copyright on the Java version from which this was adapted

        /*
         Copyright 2011 Brian Romanowski. All rights reserved.

         Redistribution and use in source and binary forms, with or without modification, are
         permitted provided that the following conditions are met:

         1. Redistributions of source code must retain the above copyright notice, this list of
         conditions and the following disclaimer.

         2. Redistributions in binary form must reproduce the above copyright notice, this list
         of conditions and the following disclaimer in the documentation and/or other materials
         provided with the distribution.

         THIS SOFTWARE IS PROVIDED BY BRIAN ROMANOWSKI ``AS IS'' AND ANY EXPRESS OR IMPLIED
         WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED WARRANTIES OF MERCHANTABILITY AND
         FITNESS FOR A PARTICULAR PURPOSE ARE DISCLAIMED. IN NO EVENT SHALL BRIAN ROMANOWSKI OR
         CONTRIBUTORS BE LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
         CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR
         SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
         ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING
         NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF
         ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.

         The views and conclusions contained in the software and documentation are those of the
         authors.
         */


