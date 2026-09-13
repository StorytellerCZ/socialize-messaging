/* eslint-disable import/no-unresolved */
import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
/* eslint-enable import/no-unresolved */

import { ParticipantsCollection, ConversationsCollection, MessagesCollection } from '../../common.js';
import './publications.js';

try {
    ConversationsCollection.createIndexAsync({ _participants: 1 })
    ConversationsCollection.createIndexAsync({ createdAt: -1 })
    ConversationsCollection.createIndexAsync({ updatedAt: -1 })
} catch(e) {
    console.debug('Failed creating indexes for conversations collection.')
}

ConversationsCollection.allow({
    insert() { return false; },
});

// Add the creator of the collection as a participant on the conversation
ConversationsCollection.after.insert(async function afterInsert(userId, document) {
    await ParticipantsCollection.insertAsync({ conversationId: document._id, userId, read: true });
});

// When we delete a conversation, clean up the participants and messages that belong to the conversation
ConversationsCollection.after.remove(async function afterRemove(userId, document) {
    await MessagesCollection.direct.removeAsync({ conversationId: document._id });
    await ParticipantsCollection.direct.removeAsync({ conversationId: document._id });
});


Meteor.methods({
    async findExistingConversationWithUsers(users) {
        check(users, [String]);

        users.push(Meteor.userId());

        const conversation = await ConversationsCollection.findOneAsync({ _participants: { $size: users.length, $all: users } });

        return conversation && conversation._id;
    },
});
