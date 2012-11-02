var natural = require('natural'),
    _ = require('underscore'),
    ngrams = natural.NGrams,
    wordnet = new natural.WordNet();

var training = [
    'John read Moby Dick',
    'Mary read a different book',
    'She read a book by Cher'
];

var NGram = function(keys){
    this.keys = keys;
};
NGram.prototype.get = function(index){
    return this.keys[index];
}
NGram.prototype.backoff = function(){
    if (keys.length<=1) return null;
    return new NGram(this.keys.slice(1,this.keys.length));
}
NGram.prototype.history = function(){
    return new NGram(this.keys.slice(0,this.keys.length-1));
}
NGram.prototype.add = function(key){
    return new NGram(this.keys.splice(this.keys.length,0,key));
}
NGram.prototype.hash = function(){
    // 23/37
    var hash = 1;
    for (var i=0;i<this.keys.length;i++) hash = hash*31+this.keys[i];
    return hash;
}

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

var NGramCountModel = function(order, index, data){
    this.data =  (data)? data : [];
    this.index = (index)? index : {};
    this.order = (order)? order : 3;
}
//NGramCountModel.prototype.order = function() {
//    this.data.length;
//}
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
    var sum=0;
    for (var k in this.data[order]){
        sum+= this.data[order][k].count;
    }
    return sum;
}
NGramCountModel.prototype.countOfCounts = function(order){
    var cc = new CountOfCounts(order);
    for (var k in this.data[order]) cc.add(this.data[order][k].count);
    return cc;
}
NGramCountModel.prototype.populate = function(sentence){
    var s = this.START+ sentence.toLowerCase() + this.END;
    var self = this;
    for (var o=0; o < this.order; o++){
        ngrams.ngrams(s,o+1).forEach(function(cur){
            // add to vocab
            var keys = [];
            cur.forEach(function(word){
                var hash = self.hashStr(word);
                keys.push(hash);
                if (o==0 && !self.index[word]) self.index[word] = hash;
            });
            self.add(new NGram(keys));
        });
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

var KneserNeyModFixModel2 = function(logbase, model){
    if (!model) throw Error('no count model provided');

    this.logbase = (logbase)? logbase : 10;
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
        var n1 = coc.get(1), n2 = coc.get(2), n3 = coc.get(3), n4 = coc.get(4);
        this.d1.push(1.0 - ((2.0*n1*n2)/((n1+2.0*n2)*n1)));
        this.d2.push(2.0 - ((3.0*n1*n3)/((n1+2.0*n2)*n2)));
        this.d3p.push(3.0 - ((4.0*n1*n4)/((n1+2.0*n2)*n3)));


        // get a historymap going
        for (var k in ngs){
            var data = ngs[k];
            var ngram = data.ngram;
            var history = ngram.history();
            var historyKey = history.hash();
            if (!this.historyToNGramMap[historyKey]) this.historyToNGramMap[historyKey] = [];
            this.historyToNGramMap[historyKey].push(ngram);
        }
    }
}
KneserNeyModFixModel2.prototype.getD = function(order, count){
    // get discount factor for a given order of ngram and ngram count
    if (count==0) return 0.0;
    if (count==1) return this.d1[order];
    if (count==2) return this.d2[order];
    return this.d3p[count];

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
    var count = this.orderToNGramCounter.get(ngram.keys.length-1)[ngram.hash()].count;
    if (!count) return 0.0;
    return (count - this.getD(ngram.keys.length-1),count) / den;
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
            ngramList.forEach(function(ng){
                var count = ngramCounter[ng.hash()].count;
                cc.den += count;
                if (count==1)
                    cc.Nc[0]++;
                else if (count==2)
                    cc.Nc[1]++;
                else if (count > 2)
                    cc.Nc[2]++;
            }, this);
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

    var backoffModel = {logbase:this.logbase};
    var order = this.orderToNGramCounter.length;
    if (order==1){
        var highOrderNGrams = {};
        var model = this.orderToNGramCounter.get(0);
        for (var k in model){
            var ngram = model[k];
            highOrderNGrams[k] = {ngram:ngram, probability: Math.log(this.calcNGramProbability(ngram,0))};
        }
        backoffModel.highOrderNGrams = highOrderNGrams;
        return backoffModel;
    }

    // high order  backoff models share the same probabilities where there are counts in our model
    var lowerOrderNGrams = [];
    var highOrderNGrams = {};
    for (var o=0; o<order;o++){
        var ngramToPB = {};
        var model = this.orderToNGramCounter(o);
        for (var k in model){
            var ngram = model[k];
            ngramToPB[k] = {ngram:ngram, probability:this.recurseNGramProbability(ngram)};
        }
        if (o==order-1) highOrderNGrams = ngramToPB;
        else lowerOrderNGrams.push(ngramToPB);
    }

    // calculate backoff weights
    for (var o=1; o<order;o++){
        var model = this.orderToNGramCounter(o);
        for (var k in model){
            var ngram = model[k];
            var history = ngram.history();
            var ngpb = lowerOrderNGrams[o-1][history.hash()];
            if (!ngpb || ngpb.backoff) continue;

            var probLeftover = 1.0;
            var expandHistory = this.historyToNGramMap[history.hash()];
            for (var ngramWithHistory in expandHistory){
                if (o==order-1){
                    probLeftover -= highOrderNGrams[ngramWithHistory.hash()].probability;
                } else {
                    probLeftover -= lowerOrderNGrams[o][ngramWithHistory.hash()].probability;
                }
            }

            var probToDistribute = 0.0;
            var unigrams = lowerOrderNGrams[0];
            for (var k in unigrams){
                var unigram = unigrams[k];
                var toAdd = true;
                for (var kk in expandHistory){
                    var expandHistoryNGram = expandHistory[kk];
                    // if unigram's key equals the last key of the ngrams with history
                    //TODO: why is he using unigram.last or unigram.first - there should only be one, its a unigram??
                    if (unigram.keys[0] == expandHistoryNGram.keys[expandHistoryNGram.keys.length-1]){
                        toAdd = false;
                        break;
                    }
                    if (toAdd){
                        if (history.keys.length == 1){
                            probToDistribute += this.recurseNGramProbability(unigram);
                        } else {
                            // TODO:  this one tries to use unigram.getFirst() - once again, only one key in a unigram, why the getFirst, getLast calls??
                            probToDistribute += this.recurseNGramProbability(history.backoff().add(unigram.keys[0]))
                        }
                    }
                }
                if (!probToDistribute){
                    ngpb.backoff = 0.0
                } else {
                    ngpb.backoff = probLeftover / probToDistribute;
                }
            }
        }
    }

    // bookkeeping to set NaN backoffs to 0.
    for (var o=1; o<order-1;o++){
        var model = this.orderToNGramCounter(o);
        for (var k in model){
            var ngram = model[k];
            var history = ngram.history();
            var ngpb = lowerOrderNGrams[o-1][history.hash()];
            // log base 10
            ngpb.probability = Math.log(ngpb.probability) / Math.log(this.logbase);
            if (Number.NaN == ngpb.backoff){
                ngpb.backoff = Number.NEGATIVE_INFINITY;
            } else {
                ngpb.backoff = Math.log(ngpb.backoff) / Math.log(this.logbase);
            }
        }
    }

    // now do the high order
    for (var k in highOrderNGrams){
        var ngp = model[k];
        ngp.probability = Math.log(ngp.probability) / Math.log(this.logbase);
    }
    backoffModel.highOrderNGrams = highOrderNGrams;
    backoffModel.lowerOrderNGrams = lowerOrderNGrams;
    return backoffModel;

}
//testing
var ngcm = new NGramCountModel(3);
ngcm.populate(training[0]);
ngcm.populate(training[1]);
ngcm.populate(training[2]);
var cc = ngcm.countOfCounts(0);
console.log(cc);
//console.log(cc.get(4));
//console.log(cc.get(3));
console.log(ngcm.countOfCounts(1));
console.log(ngcm.countOfCounts(2));

var kn = new KneserNeyModFixModel2(10,ngcm);

console.log('d1', kn.d1);
console.log('d2', kn.d2);
console.log('d3p', kn.d3p);
console.log('historyToNGramMap', kn.historyToNGramMap);
console.log('sumUnigrams', kn.sumUnigrams);

console.log('backoffModel',kn.calcBackoff());