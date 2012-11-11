var kn = require('../lib/kn'),
    _ = require('underscore'),
    NGramCountModel = kn.NGramCountModel,
    KneserNeyModFixModel2 = kn.KneserNeyModFixModel2,
    NGram = kn.NGram;

// some training data
var training = [
    'John read Moby Dick',
    'Mary read a different book',
    'I read a magazine by Kristin and it was really really good',
    'I read a magazine on the plane because I was bored',
    'Bob read a different one that was more interesting',
    'Mary read a different one that was sort of boring',
    'I read a book by Kristin who had written one before by the way',
    'She read a tome',
    'She read a book by JP',
    'She read a book by me',
    'She read a book by John',
    'She read two books by me',
    'She read three books',
    'She read two books by Cher'
];


var ngcm = new NGramCountModel();
for (var t=0;t<training.length;t++) ngcm.populate(training[t]);
var cc = ngcm.countOfCounts(0);

var kn = new KneserNeyModFixModel2(ngcm);
var backoff = kn.calcBackoff();

var keys = [];
var words = [];
var found = true;
for (var arg=2;arg<process.argv.length;arg++) {
    var argtext = process.argv[arg];
    words.push(argtext);
    var idx = ngcm.index[argtext];
    if (!idx){
        found = false;
        break;
    } else {
        keys.push(idx);
    }
}

if (!found){
    console.log('input ngram: ',words,' not found in training model');
    return;
}

var test = new NGram(keys);
console.log('input ngram: ',words, ' hash=',test.hash());

var printWords = function(ngram, index){
    var str = '';
    _.each(ngram.keys,function(key){
        str += index[key]+' ';
    });
    return str;
};

var options = [];

var hashes = backoff.forwardLookup[test.hash()];
_.each(hashes,function(h){
    var item = (keys.length==2)? backoff.highOrderNGrams[h] : backoff.lowerOrderNGrams[1][h];
    options.push(item);
});

options.sort(function(a,b){
    return b.probability- a.probability;
});

options.forEach(function(item){
    console.log('\tmatch:',printWords(item.ngram, ngcm.dictionary),item.probability);
});
