import { useCallback, useEffect, useReducer, useRef } from "react";
import {
  chatResponseSchema,
  chatsResponseSchema,
  deleteChatResponseSchema,
  type ChatSummary
} from "../../chats";
import { ensureAnonymousSession } from "../../lib/anonymous-session";

type ChatHistoryState = {
  chats: ChatSummary[];
  activeChatId: string | null;
  loading: boolean;
  creating: boolean;
  deletingChatId: string | null;
  error: string | null;
};

type ChatHistoryAction =
  | { type: "loadStarted" }
  | { type: "loaded"; chats: ChatSummary[]; requestedId: string | null }
  | { type: "loadFailed"; error: string }
  | { type: "selected"; chatId: string }
  | { type: "createStarted" }
  | { type: "created"; chat: ChatSummary }
  | { type: "createFailed"; error: string }
  | { type: "deleteStarted"; chatId: string }
  | {
      type: "deleted";
      chatId: string;
      replacement: ChatSummary | null;
    }
  | { type: "deleteFailed"; error: string }
  | {
      type: "activityRecorded";
      chatId: string;
      title: string;
      updatedAt: string;
    };

const initialState: ChatHistoryState = {
  chats: [],
  activeChatId: null,
  loading: true,
  creating: false,
  deletingChatId: null,
  error: null
};

function chatHistoryReducer(
  state: ChatHistoryState,
  action: ChatHistoryAction
): ChatHistoryState {
  switch (action.type) {
    case "loadStarted":
      return { ...state, loading: true, error: null };
    case "loaded": {
      const selected =
        action.chats.find((chat) => chat.id === action.requestedId) ??
        action.chats[0] ??
        null;
      return {
        ...state,
        chats: action.chats,
        activeChatId: selected?.id ?? null,
        loading: false,
        error: null
      };
    }
    case "loadFailed":
      return { ...state, loading: false, error: action.error };
    case "selected":
      return state.chats.some((chat) => chat.id === action.chatId)
        ? { ...state, activeChatId: action.chatId }
        : state;
    case "createStarted":
      return { ...state, creating: true, error: null };
    case "created":
      return {
        ...state,
        chats: [action.chat, ...state.chats],
        activeChatId: action.chat.id,
        creating: false,
        error: null
      };
    case "createFailed":
      return { ...state, creating: false, error: action.error };
    case "deleteStarted":
      return { ...state, deletingChatId: action.chatId, error: null };
    case "deleted": {
      const deletedIndex = state.chats.findIndex(
        (chat) => chat.id === action.chatId
      );
      if (deletedIndex === -1) {
        return { ...state, deletingChatId: null };
      }

      const remaining = state.chats.filter((chat) => chat.id !== action.chatId);
      const chats = action.replacement
        ? [action.replacement, ...remaining]
        : remaining;
      const deletingActiveChat = state.activeChatId === action.chatId;
      const nextActiveChat = deletingActiveChat
        ? (remaining[deletedIndex] ??
          remaining[deletedIndex - 1] ??
          action.replacement ??
          null)
        : null;

      return {
        ...state,
        chats,
        activeChatId: deletingActiveChat
          ? (nextActiveChat?.id ?? null)
          : state.activeChatId,
        deletingChatId: null,
        error: null
      };
    }
    case "deleteFailed":
      return { ...state, deletingChatId: null, error: action.error };
    case "activityRecorded": {
      const chat = state.chats.find((item) => item.id === action.chatId);
      if (!chat) return state;
      const updated = {
        ...chat,
        title: chat.title === "New chat" ? action.title : chat.title,
        updatedAt: action.updatedAt
      };
      return {
        ...state,
        chats: [updated, ...state.chats.filter((item) => item.id !== chat.id)]
      };
    }
  }
}

export function useChatHistory() {
  const [state, dispatch] = useReducer(chatHistoryReducer, initialState);
  const loadControllerRef = useRef<AbortController | null>(null);
  const creatingRef = useRef(false);
  const deletingChatIdRef = useRef<string | null>(null);

  const selectChat = useCallback((chat: ChatSummary) => {
    dispatch({ type: "selected", chatId: chat.id });
  }, []);

  const loadChats = useCallback(async () => {
    loadControllerRef.current?.abort();
    const controller = new AbortController();
    loadControllerRef.current = controller;
    dispatch({ type: "loadStarted" });

    try {
      await ensureAnonymousSession();
      if (controller.signal.aborted) return;

      const response = await fetch("/api/chats", {
        credentials: "same-origin",
        headers: { accept: "application/json" },
        signal: controller.signal
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);

      const payload = chatsResponseSchema.parse(await response.json());
      if (controller.signal.aborted) return;
      const requestedId = new URLSearchParams(window.location.search).get(
        "chat"
      );
      dispatch({ type: "loaded", chats: payload.chats, requestedId });
    } catch (cause) {
      if (controller.signal.aborted) return;
      console.error("Failed to load chats:", cause);
      dispatch({
        type: "loadFailed",
        error: "Your chats couldn’t be loaded. Please try again."
      });
    }
  }, []);

  useEffect(() => {
    void loadChats();
    return () => loadControllerRef.current?.abort();
  }, [loadChats]);

  useEffect(() => {
    if (!state.activeChatId) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get("chat") === state.activeChatId) return;
    url.searchParams.set("chat", state.activeChatId);
    window.history.replaceState(null, "", url);
  }, [state.activeChatId]);

  const createChat = useCallback(async () => {
    if (creatingRef.current) return null;
    creatingRef.current = true;
    dispatch({ type: "createStarted" });
    try {
      const response = await fetch("/api/chats", {
        method: "POST",
        credentials: "same-origin",
        headers: { accept: "application/json" }
      });
      if (!response.ok) throw new Error(`Request failed (${response.status})`);

      const { chat } = chatResponseSchema.parse(await response.json());
      dispatch({ type: "created", chat });
      return chat;
    } catch (cause) {
      console.error("Failed to create chat:", cause);
      dispatch({
        type: "createFailed",
        error: "A new chat couldn’t be created. Please try again."
      });
      return null;
    } finally {
      creatingRef.current = false;
    }
  }, []);

  const deleteChat = useCallback(async (chat: ChatSummary) => {
    if (deletingChatIdRef.current !== null) return false;
    deletingChatIdRef.current = chat.id;
    dispatch({ type: "deleteStarted", chatId: chat.id });
    try {
      const response = await fetch(
        `/api/chats/${encodeURIComponent(chat.id)}`,
        { method: "DELETE", credentials: "same-origin" }
      );
      if (!response.ok) throw new Error(`Request failed (${response.status})`);

      const { replacement } = deleteChatResponseSchema.parse(
        await response.json()
      );
      dispatch({ type: "deleted", chatId: chat.id, replacement });
      return true;
    } catch (cause) {
      console.error("Failed to delete chat:", cause);
      dispatch({
        type: "deleteFailed",
        error: "That chat couldn’t be deleted. Please try again."
      });
      return false;
    } finally {
      deletingChatIdRef.current = null;
    }
  }, []);

  const recordActivity = useCallback((chatId: string, title: string) => {
    dispatch({
      type: "activityRecorded",
      chatId,
      title,
      updatedAt: new Date().toISOString()
    });
  }, []);

  return {
    chats: state.chats,
    activeChat:
      state.chats.find((chat) => chat.id === state.activeChatId) ?? null,
    activeChatId: state.activeChatId,
    loading: state.loading,
    creating: state.creating,
    deletingChatId: state.deletingChatId,
    error: state.error,
    loadChats,
    selectChat,
    createChat,
    deleteChat,
    recordActivity
  };
}
