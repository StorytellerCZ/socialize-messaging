import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import test from 'node:test';

const run = (file, globals) => vm.runInNewContext(
    readFileSync(new URL(file, import.meta.url), 'utf8').replace(/^import[\s\S]*?;\s*$/gm, ''), globals,
);
const extensions = readFileSync(new URL('./conversation-model/common/user-extensions.js', import.meta.url), 'utf8');
const { default: extend } = await import(`data:text/javascript;base64,${Buffer.from(extensions).toString('base64')}`);

function setup(member = false) {
    const publications = {};
    class User {
        static methods(methods) { Object.assign(this.prototype, methods); }
        static createEmpty(id) { return Object.assign(new User(), { _id: id }); }
    }
    const Meteor = { isServer: true, publish: (name, fn) => publications[name] = fn };
    const participant = { _id: 'participant', conversationId: 'private', userId: 'me' };
    const updates = [];
    const ParticipantsCollection = {
        findOneAsync: async () => member ? participant : undefined,
        updateAsync: async (...args) => updates.push(args),
        find: () => { throw new Error('Pages must select conversations, not participant activity'); },
    };
    const ConversationsCollection = { find: (selector, options) => ({ selector, options }) };
    extend({ Meteor, User, ParticipantsCollection, ConversationsCollection });
    run('./conversation-model/server/publications.js', {
        Meteor, User, ParticipantsCollection, ConversationsCollection,
        Conversation: { createEmpty: () => ({ messages: () => 'private messages' }) },
        publishComposite: Meteor.publish, check: () => {}, Match: { Optional: value => value },
    });
    return { publications, User, updates, context: { userId: 'me', ready: () => null, _session: { id: 'session' } } };
}

test('membership is false for missing and true for existing participants', async () => {
    assert.equal(await setup().User.createEmpty('me').isParticipatingInAsync('private'), false);
    assert.equal(await setup(true).User.createEmpty('me').isParticipatingInAsync('private'), true);
});

test('non-members receive neither conversation nor message publications', async () => {
    const { publications, context } = setup();
    for (const name of ['socialize.conversation', 'socialize.messagesFor']) {
        assert.equal(await publications[name].call(context, 'private'), null);
    }
});

test('conversation pages sort and offset conversation activity and retain membership filtering', async () => {
    const { publications, context } = setup(true);
    const options = { limit: 25, skip: 25, sort: { updatedAt: -1, createdAt: -1, _id: 1 } };
    const publication = await publications['socialize.conversations'].call(context, options);
    const cursor = await publication.find.call(context);
    assert.equal(cursor.selector._participants, 'me');
    assert.deepEqual(cursor.options, options);
});

test('leaving a conversation awaits the model and removes membership', async () => {
    let update;
    let removed = false;
    run('./participant-model/server/server.js', {
        Meteor: {}, User: {}, UserPresence: { onCleanup: () => {} }, console,
        ParticipantsCollection: { createIndexAsync: () => {}, allow: () => {}, after: { insert: () => {}, update: fn => update = fn } },
        ConversationsCollection: {
            updateAsync: async () => { removed = true; }, removeAsync: async () => {},
        },
    });
    await update.call({ transform: () => ({ conversation: async () => ({ isReadOnly: () => false }) }) }, 'me', {
        conversationId: 'private', userId: 'me', deleted: true,
    }, ['deleted']);
    assert.equal(removed, true);
});

test('direct collection writes cannot bypass the server send methods', () => {
    let permissions;
    const collection = { createIndexAsync: () => {}, allow: value => permissions = value, after: { insert: () => {}, remove: () => {} } };
    run('./message-model/server/server.js', { MessagesCollection: collection, ParticipantsCollection: {}, ConversationsCollection: {}, console });
    assert.equal(permissions.insert('restricted-user', { conversationId: 'private' }), false);
    assert.equal(permissions.update('restricted-user', { checkOwnership: () => true }), false);
});

test('authorized message subscriptions keep a reactive membership selector', async () => {
    const { publications, context } = setup(true);
    const publication = await publications['socialize.messagesFor'].call(context, 'private');
    const { selector } = publication.find();
    assert.equal(selector._id, 'private');
    assert.equal(selector._participants, 'me');
    assert.equal(publication.children[0].find(), 'private messages');
});

test('typing updates the collection and cleans up on subscription stop', async () => {
    const { publications, context, updates } = setup(true);
    let stop;
    context.onStop = callback => stop = callback;
    await publications['socialize.typing'].call(context, 'private');
    assert.equal(updates[0][0], 'participant');
    assert.equal(updates[0][1].$addToSet.typing, 'session');
    await stop();
    assert.equal(updates[1][1].$pull.typing, 'session');
});
