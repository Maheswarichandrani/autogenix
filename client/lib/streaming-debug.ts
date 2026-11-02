"use client";

/**
 * Streaming Debug Utilities
 * 
 * Enable these in development to see exactly what's happening
 * with the streaming pipeline in real-time.
 */

const IS_DEBUG = process.env.NODE_ENV === "development";

export const streamingDebug = {
  sse: (event: { type: string }, action: string) => {
    if (!IS_DEBUG) return;
    
    const timestamp = new Date().toISOString().slice(11, 23);
    console.log(
      `%c[SSE ${timestamp}] ${action}`,
      "color: #10b981; font-weight: bold",
      event.type,
      event
    );
    
    // Log performance metrics for text_chunk events
    if (event.type === "text_chunk") {
      performance.mark(`chunk-${Date.now()}`);
    }
  },

  store: (action: string, state: unknown) => {
    if (!IS_DEBUG) return;
    
    const timestamp = new Date().toISOString().slice(11, 23);
    console.log(
      `%c[STORE ${timestamp}] ${action}`,
      "color: #3b82f6; font-weight: bold",
      state
    );
  },

  render: (component: string, props: unknown) => {
    if (!IS_DEBUG) return;
    
    const timestamp = new Date().toISOString().slice(11, 23);
    console.log(
      `%c[RENDER ${timestamp}] ${component}`,
      "color: #f59e0b; font-weight: bold",
      props
    );
  },

  performance: {
    startStreaming: () => {
      if (!IS_DEBUG) return;
      performance.mark("streaming-start");
    },
    
    endStreaming: () => {
      if (!IS_DEBUG) return;
      performance.mark("streaming-end");
      try {
        performance.measure("total-streaming-time", "streaming-start", "streaming-end");
        const measure = performance.getEntriesByName("total-streaming-time")[0];
        console.log(
          `%c[PERF] Total streaming time: ${measure.duration.toFixed(2)}ms`,
          "color: #8b5cf6; font-weight: bold"
        );
      } catch (e) {
        // Ignore measurement errors
      }
    }
  }
};
