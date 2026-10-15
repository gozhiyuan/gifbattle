// Sourcing buckets are provisional; image review determines the published categories.
const { STOCK_SUBJECTS } = require('./stock-subjects.cjs');
exports.STOCK_CATEGORIES = [
 ['awkward', ['awkward cat', 'dog embarrassed', 'cat yawning', 'funny animal']],
 ['shocked', ['surprised cat', 'startled dog', 'cat wide eyes', 'surprised animal']],
 ['nope', ['cat hiding', 'dog refusing', 'cat looking away', 'animal hiding']],
 ['celebration', ['happy dog', 'dog playing', 'jumping dog', 'happy animal']],
 ['suspicious', ['cat staring', 'dog side eye', 'owl staring', 'curious animal']],
 ['facepalm', ['dog covering eyes', 'cat paw face', 'sleepy cat', 'tired animal']],
 ['panic', ['running cat', 'dog running', 'bird flying', 'animal escape']],
 ['waiting', ['cat waiting', 'dog waiting', 'cat window', 'dog sitting']],
 ['disappointment', ['sad dog', 'cat empty bowl', 'lonely cat', 'rainy dog']],
 ['confused', ['dog head tilt', 'curious cat', 'puzzled dog', 'curious owl']],
 ['angry', ['hissing cat', 'growling dog', 'angry goose', 'cat teeth']],
 ['fail', ['wet cat', 'dog mud', 'cat cardboard box', 'animal mess']],
 ['exhausted', ['sleeping dog', 'sleeping cat', 'tired animal', 'resting sloth']],
 ['hungry', ['cat food', 'dog eating', 'squirrel eating', 'animal eating']],
 ['smug', ['cat sitting', 'proud dog', 'cat lounging', 'peacock displaying']],
 ['bored', ['cat resting', 'dog lying', 'bored animal', 'cat sofa']],
 ['love', ['cats cuddling', 'dogs together', 'animal affection', 'cat kitten']],
 ['determined', ['dog jumping', 'cat climbing', 'squirrel climbing', 'animal balancing']],
 ['chaos', ['cats playing', 'dogs playing', 'animal crowd', 'puppy play']],
 ['relief', ['dog relaxing', 'cat stretching', 'animal sunshine', 'cat sleeping']]
].map(([id, queries]) => ({ id, label: id[0].toUpperCase() + id.slice(1), queries,
 subjectQueries: STOCK_SUBJECTS.map(subject => ({ subject: subject.id,
   queries: subject.queries.map(query => `${id} ${query}`) }))
}));
