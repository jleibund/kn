var natural = require('natural'),
    _ = require('underscore'),
    ngrams = natural.NGrams,
    wordnet = new natural.WordNet();

var training = [
    'John read Moby Dick',
    'Mary read a different book',
    'I read a magazine by Kristin',
    'I read a magazine on the plane',
    'Bob read a different one',
    'Mary read a different one',
    'I read a book by Kristin',
    'She read a tome',
    'She read a book by JP',
    'She read a book by JP',
    'She read a book by JP',
    'She read a book by JP',
    'She read a book by JP',
    'She read a book by JP',
    'She read a book by me',
    'She read a book by me',
    'She read a book by me',
    'She read a book by me',
    'She read a book by me',
    'She read a book by me',
    'She read a book by me',
    'She read a book by me',
    'She read a book by me',
    'She read a book by me',
    'She read a book by me',
    'She read a book by me',
    'She read a book by me',
    'She read a book by me',
    'She read a book by me',
    'She read a book by me',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read a book by John',
    'She read two books by me',
    'She read three books',
    'She read two books by Cher'
];

var NGram = function(keys){
    this.keys = keys;
};
NGram.prototype.get = function(index){
    return this.keys[index];
}
NGram.prototype.backoff = function(){
    if (this.keys.length<=1) return null;
    var clone = this.keys.slice(0);
    return new NGram(clone.slice(1,this.keys.length));
}
NGram.prototype.history = function(){
    var clone = this.keys.slice(0);
    return new NGram(clone.slice(0,this.keys.length-1));
}
NGram.prototype.add = function(key){
    var clone = this.keys.slice(0);
    clone.push(key);
    return new NGram(clone);
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
        var n1 = coc.get(1) | 1, n2 = coc.get(2), n3 = coc.get(3), n4 = coc.get(4);

        if (!n1) n1 = 1;
        if (!n2) n2 = 1;
        if (!n3) n3 = 1;
        if (!n4) n4 = 1;

        // my hack
        var dis1 = ((2.0*n1*n2)/((n1+2.0*n2)*n1));
        var dis2 = ((3.0*n1*n3)/((n1+2.0*n2)*n2));
        var dis3 = ((4.0*n1*n4)/((n1+2.0*n2)*n3));

//        if (!dis1) dis1 = 1e-6;
//        if (!dis2) dis2 = 1e-6;
//        if (!dis3) dis3 = 1e-6;

        this.d1.push(1.0 - dis1);
        this.d2.push(2.0 - dis2);
        this.d3p.push(3.0 - dis3);

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
            for (var k in ngramCounter){
                var counter = ngramCounter[k];
                var count = counter.count;
                cc.den += count;
                if (count==1)
                    cc.Nc[0]++;
                else if (count==2)
                    cc.Nc[1]++;
                else if (count > 2)
                    cc.Nc[2]++;
            }
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
    var order = this.orderToNGramCounter.order;
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
        var model = this.orderToNGramCounter.get(o);
        for (var k in model){
            var ngram = model[k].ngram;
            ngramToPB[k] = {ngram:ngram, probability:this.recurseNGramProbability(ngram)};
        }
        if (o==order-1) highOrderNGrams = ngramToPB;
        else lowerOrderNGrams.push(ngramToPB);
    }

    // calculate backoff weights
    for (var o=1; o<order;o++){
        var model = this.orderToNGramCounter.get(o);
        for (var k in model){
            var counter = model[k];
            var ngram = counter.ngram;
            var history = ngram.history();
            var ngpb = lowerOrderNGrams[o-1][history.hash()];
            if (!ngpb || ngpb.backoff) continue;

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
            for (var k in unigrams){
                var unigramCounter = unigrams[k];
                var unigram = unigramCounter.ngram;
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
    for (var o=0; o<lowerOrderNGrams.length;o++){
        var model = lowerOrderNGrams[o];
        for (var k in model){
            var ngpb = model[k];
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
        var ngp = highOrderNGrams[k];
        ngp.probability = Math.log(ngp.probability) / Math.log(this.logbase);
    }
    backoffModel.highOrderNGrams = highOrderNGrams;
    backoffModel.lowerOrderNGrams = lowerOrderNGrams;
    return backoffModel;

}
//testing
var ngcm = new NGramCountModel(3);
for (var t=0;t<training.length;t++) ngcm.populate(training[t]);
var cc = ngcm.countOfCounts(0);
//console.log(cc);
//console.log(cc.get(4));
//console.log(cc.get(3));
//console.log(ngcm.countOfCounts(1));
//console.log(ngcm.countOfCounts(2));

var kn = new KneserNeyModFixModel2(10,ngcm);


var backoff = kn.calcBackoff();

var test = new NGram([ngcm.index['read'], ngcm.index['a']]);
console.log('test',test);

var printWords = function(ngram, index){
    var str = '';
    var id = ngram.keys[ngram.keys.length-1];
    for (var k in index){
        if (index[k] == id){
            str += k+' ';
            break;
        }
    }
    return str;
}

var options = [];
for (var k in backoff.highOrderNGrams){
    if (backoff.highOrderNGrams[k].ngram.history().hash()== test.hash()){
        options.push(backoff.highOrderNGrams[k]);
    }
}

for (var j in backoff.lowerOrderNGrams[1]){
    if (backoff.lowerOrderNGrams[1][j].ngram.history().hash()== test.backoff().hash()){
        console.log('\tmatch2:',printWords(backoff.lowerOrderNGrams[1][j].ngram, ngcm.index),backoff.lowerOrderNGrams[1][j].probability);
    }
}

options.sort(function(a,b){
    return b.probability- a.probability;
})

options.forEach(function(item){
    console.log('\tmatch3:',printWords(item.ngram, ngcm.index),item.probability);
});

