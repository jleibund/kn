//This is a port of Brian Romanowski's open source Kneser-Ney language model according to Chen and Goodman's kneser-ney-mod-fix
//description, originally written in Java, now for nodejs using the 'natural' npm package.  See copyright:

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

var natural = require('natural'),
    _ = require('underscore'),
    naturalNGrams = natural.NGrams;

var NGram = function(keys){
    this.keys = keys;
};
NGram.prototype.get = function(index){
    return this.keys[index];
};
NGram.prototype.backoff = function(){
    if (this.keys.length<=1) return null;
    var clone = this.keys.slice(0);
    return new NGram(clone.slice(1,this.keys.length));
};
NGram.prototype.history = function(){
    var clone = this.keys.slice(0);
    return new NGram(clone.slice(0,this.keys.length-1));
};
NGram.prototype.add = function(key){
    var clone = this.keys.slice(0);
    clone.push(key);
    return new NGram(clone);
};
NGram.prototype.hash = function(){
    // 23/37
    var hash = 1;
    var calcHash = function(key){
        hash = hash*31+key;
    };
    _.each(this.keys, calcHash);
    return hash;
};

var CountOfCounts = function(order){
    this.data = {};
    this.order = order;
}
CountOfCounts.prototype.add= function(count){
    if (!this.data[count+'']) this.data[count+''] = 1;
    else this.data[count+'']++;
}
CountOfCounts.prototype.get= function(count){
    if (!this.data[count+'']) return 0;
    return this.data[count+''];
}

var NGramCountModel = function(options){
    this.data =  (options && options.data)? options.data : [];
    this.index = (options && options.index)? options.index : {};
    this.dictionary = (options && options.dictionary) ? options.dictionary: {};
    this.order = (options && options.order)? options.order : 3;
}
NGramCountModel.prototype.get = function(order) {
    if (this.data.length-1 < order){
        for (var i = this.data.length-1; i<order;i++) this.data.push({});
    }
    // adjust order
    return this.data[order];
}
NGramCountModel.prototype.add = function(ngram) {
    var model = this.get(ngram.keys.length-1);
    var key = ngram.hash()+'';
    var data = model[key];
    if (data) data.count++;
    else {
        data = model[key]= {ngram:ngram, count:1};
    }
    return data;
}

NGramCountModel.prototype.sum = function(order){
    //var sum=0;
    var inc = function(memo,obj){ return memo + obj.count; };
    return _.reduce(_.values(this.data[order]),inc,0);
}
NGramCountModel.prototype.countOfCounts = function(order){
    var cc = new CountOfCounts(order);
    var ccAdd= function(obj) { cc.add(obj.count) ;}
    _.each(_.values(this.data[order]),ccAdd);
    return cc;
}
NGramCountModel.prototype.populate = function(sentence){
    var s = this.START+ sentence.toLowerCase() + this.END;
    var self = this;

    var pop = function(cur){
        // add to vocab
        var keys = [];

        var pushHash = function(word){
            var hash = self.hashStr(word);
            keys.push(hash);
            if (o==0 && !self.index[word]) self.index[word] = hash;
            if (o==0 && !self.dictionary[hash]) self.dictionary[hash] = word;
        };

        _.each(cur,pushHash,cur);
        this.add(new NGram(keys));
    };

    for (var o=0; o < this.order; o++){
        _.each(naturalNGrams.ngrams(s,o+1),pop,this);
    }
};
NGramCountModel.prototype.hashStr = function(word){
    var len = word.length;
    var h = 0;
    if (len > 0){
        for (var i=0;i<len;i++) h=31*h+ word.charCodeAt(i);
    }
    return h;
}

NGramCountModel.prototype.START = '<s>';
NGramCountModel.prototype.END = '</s>';

var KneserNeyModFixModel2 = function(model,options){
    if (!model) throw Error('no count model provided');

    this.logbase = (options && options.logbase)? options.logbase : 10;
    this.orderToNGramCounter = model;
    this.sumUnigrams = model.sum(0);
    this.historyToIntermediateValueCache = {};
    this.historyToNGramMap = {};
    this.d1 = [];
    this.d2 = [];
    this.d3p = [];

    var order = model.order;
    for (var o=0; o<order; o++){
        // calculate D's

        var ngs = model.get(o);
        var coc = model.countOfCounts(o);
        var n1 = coc.get(1) | 1, n2 = coc.get(2), n3 = coc.get(3), n4 = coc.get(4);

//////// start of my hack - KN doesn't work well on small sample sizes, adjusting these to avoid /0 errors ////
        if (!n1) n1 = 1;
        if (!n2) n2 = 1;
        if (!n3) n3 = 1;
        if (!n4) n4 = 1;
//////// end of my hack - no idea what effect this has on smoothing, but as training text size increases effect should disappear

        // my hack
        var dis1 = ((2.0*n1*n2)/((n1+2.0*n2)*n1));
        var dis2 = ((3.0*n1*n3)/((n1+2.0*n2)*n2));
        var dis3 = ((4.0*n1*n4)/((n1+2.0*n2)*n3));

        this.d1.push(1.0 - dis1);
        this.d2.push(2.0 - dis2);
        this.d3p.push(3.0 - dis3);

        var histMap = function(data){
            var ngram = data.ngram;
            var history = ngram.history();
            var historyKey = history.hash();
            if (!this.historyToNGramMap[historyKey]) this.historyToNGramMap[historyKey] = [];
            this.historyToNGramMap[historyKey].push(ngram);
        }

        // get a historymap going
        _.each(_.values(ngs),histMap,this);
    }
}
KneserNeyModFixModel2.prototype.getD = function(order, count){
    // get discount factor for a given order of ngram and ngram count
    if (count==0) return 0.0;
    if (count==1) return this.d1[order];
    if (count==2) return this.d2[order];
    return this.d3p[order];

}
KneserNeyModFixModel2.prototype.calcGamma = function(history, den, Nc){
    // history - gram object, den - denominator of gamma factor, Nc - array of number of unique words that appear (once, twice, three or more) after the history
    var order = history.keys.length;
    var gamma = this.getD(order,1) * Nc[0];
    gamma += this.getD(order,2) * Nc[1];
    gamma += this.getD(order,3) * Nc[2];
    return gamma / den;
}
KneserNeyModFixModel2.prototype.calcNGramProbability = function(ngram, den){
    if (ngram.keys.length ==1){
        var count = this.orderToNGramCounter.get(0)[ngram.hash()].count;
        return count / this.sumUnigrams;
    }
    var ng = this.orderToNGramCounter.get(ngram.keys.length-1)[ngram.hash()];
    if (!ng || !ng.count) return 0.0;
    return (ng.count - this.getD(ngram.keys.length-1,ng.count)) / den;
}
KneserNeyModFixModel2.prototype.getIntermediateValues = function(history){
    var historyHash = history.hash();
    var cc = this.historyToIntermediateValueCache[historyHash];
    if (!cc){
        cc = {};
        cc.den = 0;
        cc.Nc = [0,0,0];
        var ngramList = this.historyToNGramMap[historyHash];
        if (ngramList){
            var ngramCounter = this.orderToNGramCounter.get(history.keys.length-1);
            var ncInc = function(counter){
                var count = counter.count;
                cc.den += count;
                if (count==1)
                    cc.Nc[0]++;
                else if (count==2)
                    cc.Nc[1]++;
                else if (count > 2)
                    cc.Nc[2]++;
            }

            _.each(_.values(ngramCounter),ncInc,this);

            this.historyToIntermediateValueCache[historyHash] = cc;
        }
    }
    return cc;
}
//Perform Chen and Goodman's recursive interpolation calculation of kneser-ney-mod.
KneserNeyModFixModel2.prototype.recurseNGramProbability = function(ngram){
    if (ngram.keys.length==1) return this.calcNGramProbability(ngram, 0);
    var history = ngram.history();
    if (this.historyToNGramMap[history.hash()]){
        var cc = this.getIntermediateValues(history);
        return this.calcNGramProbability(ngram, cc.den) + this.calcGamma(history,cc.den,cc.Nc) * this.recurseNGramProbability(ngram.backoff());
    } else {
        return this.recurseNGramProbability(ngram.backoff());
    }
}
KneserNeyModFixModel2.prototype.logProbability = function(ngram){
    return Math.log(this.recurseNGramProbability(ngram));
}
KneserNeyModFixModel2.prototype.calcBackoff = function(){
    var self = this;
    var backoffModel = {logbase:this.logbase};
    var order = this.orderToNGramCounter.order;
    if (order==1){
        var highOrderNGrams = {};
        var model = this.orderToNGramCounter.get(0);
        var setHighOrderNGrams = function(k){
            var ngram = model[k];
            highOrderNGrams[k] = {ngram:ngram, probability: Math.log(this.calcNGramProbability(ngram,0))};
        }
        _.each(_.keys(model),setHighOrderNGrams, this);
        backoffModel.highOrderNGrams = highOrderNGrams;
        return backoffModel;
    }

    // high order  backoff models share the same probabilities where there are counts in our model
    var lowerOrderNGrams = [];
    var highOrderNGrams = {};
    for (var o=0; o<order;o++){
        var ngramToPB = {};
        var model = this.orderToNGramCounter.get(o);
        var setNGramToPB = function(k){
            var ngram = model[k].ngram;
            ngramToPB[k] = {ngram:ngram, probability:this.recurseNGramProbability(ngram)};
        }
        _.each(_.keys(model),setNGramToPB,this);
        if (o==order-1) highOrderNGrams = ngramToPB;
        else lowerOrderNGrams.push(ngramToPB);
    }

    // calculate backoff weights
    for (var o=1; o<order;o++){
        var model = this.orderToNGramCounter.get(o);
        var processNGramInModel = function(k){
            var counter = model[k];
            var ngram = counter.ngram;
            var history = ngram.history();
            var ngpb = lowerOrderNGrams[o-1][history.hash()];
            if (!ngpb || ngpb.backoff) return;

            var probLeftover = 1.0;
            var expandHistory = this.historyToNGramMap[history.hash()];

            for (var i= 0; i<expandHistory.length;i++){
                var ngramWithHistory = expandHistory[i];
                if (o==order-1){
                    probLeftover -= highOrderNGrams[ngramWithHistory.hash()].probability;
                } else {
                    probLeftover -= lowerOrderNGrams[o][ngramWithHistory.hash()].probability;
                }
            }

            var probToDistribute = 0.0;
            var unigrams = lowerOrderNGrams[0];
            var iterateUnigramCounters = function(unigramCounter){
                var unigram = unigramCounter.ngram;
                var toAdd = true;
                var calcByHistory = function(expandHistoryNGram){
                    // if unigram's key equals the last key of the ngrams with history
                    if (unigram.keys[0] == expandHistoryNGram.keys[expandHistoryNGram.keys.length-1]){
                        toAdd = false;
                        return;
                    }
                    if (toAdd){
                        if (history.keys.length == 1){
                            probToDistribute += self.recurseNGramProbability(unigram);
                        } else {
                            probToDistribute += self.recurseNGramProbability(history.backoff().add(unigram.keys[0]))
                        }
                    }
                }
                _.each(_.values(expandHistory),calcByHistory,this);
                if (!probToDistribute){
                    ngpb.backoff = 0.0
                } else {
                    ngpb.backoff = probLeftover / probToDistribute;
                }
            }
            _.each(_.values(unigrams),iterateUnigramCounters,this);
        }
        _.each(_.keys(model),processNGramInModel,this);
    }

    var forwardLookup = {};

    var fwdLookupAdd = function(ngp){
        var historyHash  = ngp.ngram.history().hash();
        if (!forwardLookup[historyHash]) forwardLookup[historyHash] = [];
        forwardLookup[historyHash].push(ngp.ngram.hash());
    }

    var calcProbabilityAndBackoff = function(ngpb){
        // log base 10
        ngpb.probability = Math.log(ngpb.probability) / Math.log(this.logbase);
        if (Number.NaN == ngpb.backoff){
            ngpb.backoff = Number.NEGATIVE_INFINITY;
        } else {
            ngpb.backoff = Math.log(ngpb.backoff) / Math.log(this.logbase);
        }

        // add to forward lookup
        fwdLookupAdd(ngpb);
    }

    // bookkeeping to set NaN backoffs to 0.
    var iterateLowerOrderNGrams = function(model){
        _.each(_.values(model),calcProbabilityAndBackoff,this);
    }
    _.each(_.values(lowerOrderNGrams),iterateLowerOrderNGrams,this);



    // now do the high order
    var calcHighOrderNGrams = function(ngp){
        ngp.probability = Math.log(ngp.probability) / Math.log(this.logbase);

        // wire up forward lookup
        fwdLookupAdd(ngp);

    }
    _.each(_.values(highOrderNGrams),calcHighOrderNGrams,this);

    backoffModel.highOrderNGrams = highOrderNGrams;
    backoffModel.lowerOrderNGrams = lowerOrderNGrams;
    backoffModel.forwardLookup = forwardLookup;
    return backoffModel;

}

module.exports.KneserNeyModFixModel2 = KneserNeyModFixModel2;
module.exports.NGramCountModel = NGramCountModel;
module.exports.NGram = NGram;
module.exports.CountOfCounts = CountOfCounts;