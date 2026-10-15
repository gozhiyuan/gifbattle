// Subject diversity is independent of the reaction labels shown to players.
exports.STOCK_SUBJECTS = [
 { id: 'cats', queries: ['expressive cat', 'cat mishap'] },
 { id: 'dogs', queries: ['expressive dog', 'dog mishap'] },
 { id: 'other-animals', queries: ['funny monkey', 'goose expression'] },
 { id: 'food', queries: ['messy food', 'burnt toast'] },
 { id: 'objects', queries: ['broken umbrella', 'tangled cables'] },
 { id: 'situations', queries: ['messy room', 'traffic jam'] },
 { id: 'history', queries: ['historical photograph', 'vintage invention'] },
 { id: 'art', queries: ['expressive painting', 'caricature'] }
];
exports.SUBJECT_IDS = exports.STOCK_SUBJECTS.map(subject => subject.id);
exports.inferSubject = asset => {
 const explicit = asset.aiSuggestions?.primarySubject || asset.primarySubject;
 if (exports.SUBJECT_IDS.includes(explicit)) return explicit;
 // Legacy records have no visual subject assessment: a conservative text fallback.
 const text = [asset.title, asset.description, ...(asset.tags || [])].join(' ').toLowerCase();
 if (/\b(cat|cats|kitten|kittens|feline)\b/.test(text)) return 'cats';
 if (/\b(dog|dogs|puppy|puppies|canine)\b/.test(text)) return 'dogs';
 if (/\b(bird|owl|goose|monkey|horse|goat|llama|squirrel|sloth|animal)\b/.test(text)) return 'other-animals';
 return 'unknown';
};
