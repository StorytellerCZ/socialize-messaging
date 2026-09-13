/* eslint-disable import/no-unresolved */
import { Meteor } from 'meteor/meteor';
import { User } from 'meteor/socialize:user-model';
import { UserPresence } from 'meteor/socialize:user-presence';

/* eslint-enable import/no-unresolved */

import { ParticipantsCollection, ConversationsCollection } from '../../common.js';

try {
    ParticipantsCollection.createIndexAsync({ userId: 1 })
    ParticipantsCollection.createIndexAsync({ conversationId: 1 })
    ParticipantsCollection.createIndexAsync({ observing: 1 })
    ParticipantsCollection.createIndexAsync({ createdAt: -1 })
    ParticipantsCollection.createIndexAsync({ updatedAt: -1 })
} catch(e) {
    console.debug('Failed creating indexes for participants collection.')
}

ParticipantsCollection.allow({
    fetch: ['userId', 'deleted'],
    insert() { return false; },
    update(userId, participant, fields, modifier) {
        return !!userId && participant.userId === userId && !participant.deleted
            && fields.every(field => ['read', 'deleted', 'updatedAt'].includes(field))
            && Object.keys(modifier).every(operator => operator === '$set')
            && (!fields.includes('deleted') || modifier.$set.deleted === true);
    },
});

ParticipantsCollection.after.insert(async function afterInsert(userId, document) {
    await ConversationsCollection.updateAsync(document.conversationId, { $addToSet: { _participants: document.userId } });
});

ParticipantsCollection.after.update(async function afterUpdate(userId, document, fieldNames) {
    if (fieldNames.includes('deleted') && document.deleted) {
        const conversation = await this.transform().conversation();
        if (!conversation) return;
        if (conversation.isReadOnly()) {
            await ConversationsCollection.removeAsync(document.conversationId);
        } else {
            await ConversationsCollection.updateAsync(document.conversationId, { $pull: { _participants: document.userId } });
        }
    }
});


UserPresence.onCleanup(function onCleanup(sessionIds) {
    if (sessionIds) {
        ParticipantsCollection.updateAsync({ observing: { $in: sessionIds } }, { $pullAll: { observing: sessionIds } }, { multi: true });
    } else {
        ParticipantsCollection.updateAsync({}, { $set: { observing: [] } }, { multi: true });
    }
});
