"use client";

import React, { useState } from "react";
import { Activity, ChevronDown, ChevronUp } from "lucide-react";
import type { StateUpdateEvent } from "@/app/hooks/useChat";
import { cn } from "@/lib/utils";

interface StateUpdateEventProps {
  event: StateUpdateEvent;
}

export const StateUpdateEventComponent = React.memo<StateUpdateEventProps>(
  ({ event }) => {
    const [isExpanded, setIsExpanded] = useState(false);
    const hasState = event.state && Object.keys(event.state).length > 0;

    // Filter to show only fields with meaningful values
    const meaningfulFields = event.state
      ? Object.entries(event.state).filter(([, value]) => {
          if (value === null || value === undefined || value === false) {
            return false;
          }
          if (typeof value === "string" && value === "") {
            return false;
          }
          return true;
        })
      : [];

    const shouldShowExpanded = hasState && meaningfulFields.length > 0;

    return (
      <div className="flex w-full flex-col rounded-lg border border-border/50 bg-muted/30 text-xs">
        <button
          onClick={() => shouldShowExpanded && setIsExpanded(!isExpanded)}
          className={cn(
            "flex w-full items-center gap-3 px-3 py-2 text-left",
            shouldShowExpanded && "cursor-pointer hover:bg-muted/40"
          )}
          disabled={!shouldShowExpanded}
        >
          <Activity size={14} className="shrink-0 text-muted-foreground" />
          <div className="flex flex-1 items-center gap-2">
            <span className="font-medium text-foreground">{event.node}</span>
            <span className="text-muted-foreground">updated</span>
            <div className="flex flex-wrap gap-1">
              {event.updated_fields.map((field) => (
                <span
                  key={field}
                  className={cn(
                    "rounded-md bg-primary/10 px-1.5 py-0.5 font-mono text-[10px] text-primary"
                  )}
                >
                  {field}
                </span>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-muted-foreground/60">
              {new Date(event.timestamp).toLocaleTimeString()}
            </span>
            {shouldShowExpanded &&
              (isExpanded ? (
                <ChevronUp size={14} className="text-muted-foreground" />
              ) : (
                <ChevronDown size={14} className="text-muted-foreground" />
              ))}
          </div>
        </button>

        {isExpanded && shouldShowExpanded && (
          <div className="border-t border-border/50 bg-muted/20 px-3 py-2">
            <div className="space-y-1">
              {meaningfulFields.map(([key, value]) => (
                <div key={key} className="flex items-start gap-2">
                  <span className="font-mono text-[10px] text-muted-foreground">
                    {key}:
                  </span>
                  <span className="flex-1 break-words font-mono text-[10px] text-foreground">
                    {typeof value === "string"
                      ? value
                      : JSON.stringify(value, null, 2)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    );
  }
);

StateUpdateEventComponent.displayName = "StateUpdateEventComponent";
