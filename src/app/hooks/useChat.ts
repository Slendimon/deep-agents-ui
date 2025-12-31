"use client";

import { useCallback, useState } from "react";
import { useStream } from "@langchain/langgraph-sdk/react";
import {
  type Message,
  type Assistant,
  type Checkpoint,
} from "@langchain/langgraph-sdk";
import { v4 as uuidv4 } from "uuid";
import type { UseStreamThread } from "@langchain/langgraph-sdk/react";
import type { TodoItem } from "@/app/types/types";
import { useClient } from "@/providers/ClientProvider";
import { useQueryState } from "nuqs";

export type StateUpdateEvent = {
  id: string;
  timestamp: number;
  node: string;
  updated_fields: string[];
  state?: Record<string, unknown>;
  messageId?: string; // To associate with a specific message
};

export type ConversationEventData = {
  scale_human?: boolean;
  conversation_state?: string;
  request_saved?: boolean;
  show_menu?: boolean;
  sensitive_case_type?: string | null;
  sensitive_case_message?: string | null;
  sensitive_case_summary?: string | null;
};

export type StateType = {
  messages: Message[];
  todos: TodoItem[];
  files: Record<string, string>;
  email?: {
    id?: string;
    subject?: string;
    page_content?: string;
  };
  save_request?: boolean;
  scale_human?: boolean;
  shown_menu?: boolean;
  conversation_state?: string | Record<string, unknown>;
  ui?: any;
  state_update_events?: StateUpdateEvent[];
  conversation_events?: ConversationEventData; // SSE event data
  // Individual conversation event fields (for backward compatibility)
  request_saved?: boolean;
  show_menu?: boolean;
  sensitive_case_type?: string | null;
  sensitive_case_message?: string | null;
  sensitive_case_summary?: string | null;
};

export function useChat({
  activeAssistant,
  onHistoryRevalidate,
  thread,
}: {
  activeAssistant: Assistant | null;
  onHistoryRevalidate?: () => void;
  thread?: UseStreamThread<StateType>;
}) {
  const [threadId, setThreadId] = useQueryState("threadId");
  const client = useClient();

  // State to capture conversation_events from the existing stream
  const [conversationEventsFromSSE, setConversationEventsFromSSE] = useState<ConversationEventData[]>([]);

  const stream = useStream<StateType>({
    assistantId: activeAssistant?.assistant_id || "",
    client: client ?? undefined,
    reconnectOnMount: true,
    threadId: threadId ?? null,
    onThreadId: setThreadId,
    defaultHeaders: { "x-auth-scheme": "langsmith" },
    fetchStateHistory: true,
    // Revalidate thread list when stream finishes, errors, or creates new thread
    onFinish: onHistoryRevalidate,
    onError: onHistoryRevalidate,
    onCreated: onHistoryRevalidate,
    thread: thread,
    // Capture custom events (conversation_events)
    onCustomEvent: (data) => {
      console.log("📨 onCustomEvent called with data:", data);
      if (data && typeof data === "object") {
        // El backend puede estar enviando los datos directamente o envueltos
        const eventData = data as ConversationEventData;
        console.log("✅ Captured conversation event:", eventData);
        setConversationEventsFromSSE((prev) => [...prev, eventData]);
      }
    },
  });

  const sendMessage = useCallback(
    (content: string) => {
      const newMessage: Message = { id: uuidv4(), type: "human", content };
      stream.submit(
        { messages: [newMessage] },
        {
          optimisticValues: (prev) => ({
            messages: [...(prev.messages ?? []), newMessage],
          }),
          config: { ...(activeAssistant?.config ?? {}), recursion_limit: 100 },
        }
      );
      // Update thread list immediately when sending a message
      onHistoryRevalidate?.();
    },
    [stream, activeAssistant?.config, onHistoryRevalidate]
  );

  const runSingleStep = useCallback(
    (
      messages: Message[],
      checkpoint?: Checkpoint,
      isRerunningSubagent?: boolean,
      optimisticMessages?: Message[]
    ) => {
      if (checkpoint) {
        stream.submit(undefined, {
          ...(optimisticMessages
            ? { optimisticValues: { messages: optimisticMessages } }
            : {}),
          config: activeAssistant?.config,
          checkpoint: checkpoint,
          ...(isRerunningSubagent
            ? { interruptAfter: ["tools"] }
            : { interruptBefore: ["tools"] }),
        });
      } else {
        stream.submit(
          { messages },
          { config: activeAssistant?.config, interruptBefore: ["tools"] }
        );
      }
    },
    [stream, activeAssistant?.config]
  );

  const setFiles = useCallback(
    async (files: Record<string, string>) => {
      if (!threadId) return;
      // TODO: missing a way how to revalidate the internal state
      // I think we do want to have the ability to externally manage the state
      await client.threads.updateState(threadId, { values: { files } });
    },
    [client, threadId]
  );

  const continueStream = useCallback(
    (hasTaskToolCall?: boolean) => {
      stream.submit(undefined, {
        config: {
          ...(activeAssistant?.config || {}),
          recursion_limit: 100,
        },
        ...(hasTaskToolCall
          ? { interruptAfter: ["tools"] }
          : { interruptBefore: ["tools"] }),
      });
      // Update thread list when continuing stream
      onHistoryRevalidate?.();
    },
    [stream, activeAssistant?.config, onHistoryRevalidate]
  );

  const markCurrentThreadAsResolved = useCallback(() => {
    stream.submit(null, { command: { goto: "__end__", update: null } });
    // Update thread list when marking thread as resolved
    onHistoryRevalidate?.();
  }, [stream, onHistoryRevalidate]);

  const resumeInterrupt = useCallback(
    (value: any) => {
      stream.submit(null, { command: { resume: value } });
      // Update thread list when resuming from interrupt
      onHistoryRevalidate?.();
    },
    [stream, onHistoryRevalidate]
  );

  const stopStream = useCallback(() => {
    stream.stop();
  }, [stream]);

  console.log("📨 Conversation events from SSE:", conversationEventsFromSSE);

  // Process conversation events from SSE into StateUpdateEvent format
  const conversationEvents: StateUpdateEvent[] = conversationEventsFromSSE.map((convData: ConversationEventData) => {
    const updatedFields: string[] = [];
    const stateData: Record<string, unknown> = {};

    // Check each field and add to updated_fields if it has a meaningful value
    if (convData.scale_human === true) {
      updatedFields.push("scale_human");
      stateData.scale_human = true;
    }

    if (convData.request_saved === true) {
      updatedFields.push("request_saved");
      stateData.request_saved = true;
    }

    if (convData.show_menu === true) {
      updatedFields.push("show_menu");
      stateData.show_menu = true;
    }

    if (convData.conversation_state && convData.conversation_state !== "") {
      updatedFields.push("conversation_state");
      stateData.conversation_state = convData.conversation_state;
    }

    if (convData.sensitive_case_type) {
      updatedFields.push("sensitive_case_type");
      stateData.sensitive_case_type = convData.sensitive_case_type;
      if (convData.sensitive_case_message) {
        updatedFields.push("sensitive_case_message");
        stateData.sensitive_case_message = convData.sensitive_case_message;
      }
      if (convData.sensitive_case_summary) {
        updatedFields.push("sensitive_case_summary");
        stateData.sensitive_case_summary = convData.sensitive_case_summary;
      }
    }

    return {
      id: uuidv4(),
      timestamp: Date.now(),
      node: "conversation",
      updated_fields: updatedFields,
      state: stateData,
    };
  }).filter((event: StateUpdateEvent) => event.updated_fields.length > 0); // Only include events with meaningful fields

  // Combine server events with derived conversation events
  const allStateUpdateEvents = [
    ...(stream.values.state_update_events ?? []),
    ...conversationEvents,
  ];

  console.log("🎯 All state update events:", allStateUpdateEvents);

  return {
    stream,
    todos: stream.values.todos ?? [],
    files: stream.values.files ?? {},
    email: stream.values.email,
    ui: stream.values.ui,
    setFiles,
    messages: stream.messages,
    isLoading: stream.isLoading,
    isThreadLoading: stream.isThreadLoading,
    interrupt: stream.interrupt,
    getMessagesMetadata: stream.getMessagesMetadata,
    sendMessage,
    runSingleStep,
    continueStream,
    stopStream,
    markCurrentThreadAsResolved,
    resumeInterrupt,
    stateUpdateEvents: allStateUpdateEvents,
  };
}
