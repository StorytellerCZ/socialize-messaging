import { ParticipantsCollection, ConversationsCollection, MessagesCollection } from '../../common.js';

try {
    MessagesCollection.createIndexAsync({ userId: 1 })
    MessagesCollection.createIndexAsync({ conversationId: 1 })
    MessagesCollection.createIndexAsync({ createdAt: -1 })
    MessagesCollection.createIndexAsync({ updatedAt: -1 })
} catch(e) {
    console.debug('Failed creating indexes for message collection.')
}

// Sending goes through pm.reply / pm.conversation.new, which enforce restrictions
// and sanitize content. Ownership alone must not enable a second write path.
MessagesCollection.allow({
    insert() { return false; },
    update() { return false; },
});

// After a message is sent we need to update the ParticipantsCollection and ConversationsCollection
MessagesCollection.after.insert(async function afterInsert(userId, document) {
    /* Only update participants who aren't observing the conversation.
     * If we update users who are reading the conversation it will show the
     * conversation as unread to the user. This would be bad UX design
     *
     * Tracking observations is done through the "viewingConversation" subscription
    */
    await ParticipantsCollection.updateAsync({
        userId: { $ne: userId },
        conversationId: document.conversationId,
        deleted: { $exists: false },
        observing: {
            $size: 0,
        },
        read: true,
    }, {
        $set: { read: false },
    }, {
        multi: true,
    });

    // update the date on the conversation for sorting the conversation from newest to oldest
    await ConversationsCollection.updateAsync(document.conversationId, { $inc: { messageCount: 1 } });
});

MessagesCollection.after.remove(async function afterRemove(userId, document) {
    await ConversationsCollection.updateAsync(document.conversationId, { $inc: { messageCount: -1 } });
});
