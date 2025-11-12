## Issue with premature tool execution done


We have a logic in place for showing the tools when they are done.
Looks like sometimes server can send premature messages from assistant that are being updated after.
Because of this bug we are showing this pre-mature messages in chat for a brief moment, then they disappear and appear again when properly updated by the assistant.
Here are two examples of messages, I was lucky enough to catch. One is this premature response and second one is the proper one we have after.
We need to make sure that our conditions for understanding that the message is done and can be showed in chat can properly catch such cases and doesn't allow pre-mature showing those in a chat.

Message when it showwed in chat:
```json
{
  "info": {
    "id": "msg_a784f46a9001FH6xI3ub7xUFg6",
    "sessionID": "ses_587d5a922ffe7DqsUjT2Mnbh4Y",
    "role": "assistant",
    "time": {
      "created": 1762955052713,
      "completed": 1762955064605
    },
    "parentID": "msg_a784b60ad001Faza2idNwS0FM5",
    "modelID": "gpt-5-codex-low",
    "providerID": "openai",
    "mode": "build",
    "path": {
      "cwd": "/Users/btriapitsyn/projects/openchamber",
      "root": "/Users/btriapitsyn/projects/openchamber"
    },
    "cost": 0,
    "tokens": {
      "input": 0,
      "output": 0,
      "reasoning": 0,
      "cache": {
        "read": 0,
        "write": 0
      }
    },
    "clientRole": "assistant",
    "animationSettled": false,
    "status": "completed"
  },
  "parts": [
    {
      "id": "prt_a784f4c34001l26MGDiq1SWTik",
      "sessionID": "ses_587d5a922ffe7DqsUjT2Mnbh4Y",
      "messageID": "msg_a784f46a9001FH6xI3ub7xUFg6",
      "type": "step-start",
      "snapshot": "11655956d53d426e36d6b3d91f85418e00095d95"
    },
    {
      "id": "prt_a784f519b001Ful1aTO2RzNmHn",
      "sessionID": "ses_587d5a922ffe7DqsUjT2Mnbh4Y",
      "messageID": "msg_a784f46a9001FH6xI3ub7xUFg6",
      "type": "reasoning",
      "text": "**Searching for canOverrideDefault references**",
      "metadata": {
        "openai": {
          "itemId": "rs_0cc9d0655c1080f70169148f2f730c819fa53d8fb7bced4a0e",
          "reasoningEncryptedContent": "gAAAAABpFI8wZdyJgJgLMEM7nBi4a6RuVTHNiTncGIzdH1bK_ngv8D"
        }
      },
      "time": {
        "start": 1762955055515,
        "end": 1762955056424
      }
    },
    {
      "id": "prt_a784f5528001YLkHs5CPre6zZe",
      "sessionID": "ses_587d5a922ffe7DqsUjT2Mnbh4Y",
      "messageID": "msg_a784f46a9001FH6xI3ub7xUFg6",
      "type": "tool",
      "callID": "call_QgVtchR1AC9VouZgsBNrwB6c",
      "tool": "bash",
      "state": {
        "status": "completed",
        "input": {},
        "raw": "",
        "time": {
          "end": 1762955064605
        }
      }
    }
  ]
}
```
Then this message dissapeared and appeared again with proper description.
It was looking like this:
```json
{
  "info": {
    "id": "msg_a784f46a9001FH6xI3ub7xUFg6",
    "sessionID": "ses_587d5a922ffe7DqsUjT2Mnbh4Y",
    "role": "assistant",
    "time": {
      "created": 1762955052713,
      "completed": 1762955073581
    },
    "parentID": "msg_a784b60ad001Faza2idNwS0FM5",
    "modelID": "gpt-5-codex-low",
    "providerID": "openai",
    "mode": "build",
    "path": {
      "cwd": "/Users/btriapitsyn/projects/openchamber",
      "root": "/Users/btriapitsyn/projects/openchamber"
    },
    "cost": 0,
    "tokens": {
      "input": 72669,
      "output": 57,
      "reasoning": 0,
      "cache": {
        "read": 71296,
        "write": 0
      }
    },
    "clientRole": "assistant",
    "animationSettled": true,
    "status": "completed"
  },
  "parts": [
    {
      "id": "prt_a784f4c34001l26MGDiq1SWTik",
      "sessionID": "ses_587d5a922ffe7DqsUjT2Mnbh4Y",
      "messageID": "msg_a784f46a9001FH6xI3ub7xUFg6",
      "type": "step-start",
      "snapshot": "11655956d53d426e36d6b3d91f85418e00095d95"
    },
    {
      "id": "prt_a784f519b001Ful1aTO2RzNmHn",
      "sessionID": "ses_587d5a922ffe7DqsUjT2Mnbh4Y",
      "messageID": "msg_a784f46a9001FH6xI3ub7xUFg6",
      "type": "reasoning",
      "text": "**Searching for canOverrideDefault references**",
      "metadata": {
        "openai": {
          "itemId": "rs_0cc9d0655c1080f70169148f2f730c819fa53d8fb7bced4a0e",
          "reasoningEncryptedContent": "gAAAAABpFI8wZdyJgJgLMEM7nBi4a6RuVTHNiTncGIzdH1bK_ngv8D7Fg_5l6SY_WDlwBAl2FBnb94EKp5Npm88ct5UW1vX0Lo2yUrtJl_o4l6IOvgD4U2dtaBpT1fHsPEfjLaNk_4FTIJWosybpvG-ZIeQe5WIquLuH8K0-OWft6Kd4y85feiqr51cgzOjDd5Vr8bjs4r5dIWLFUhOcOAPN_EKT3-w7Isb0K"
        }
      },
      "time": {
        "start": 1762955055515,
        "end": 1762955056424
      }
    },
    {
      "id": "prt_a784f5528001YLkHs5CPre6zZe",
      "sessionID": "ses_587d5a922ffe7DqsUjT2Mnbh4Y",
      "messageID": "msg_a784f46a9001FH6xI3ub7xUFg6",
      "type": "tool",
      "callID": "call_QgVtchR1AC9VouZgsBNrwB6c",
      "tool": "bash",
      "state": {
        "status": "completed",
        "input": {
          "command": "cd /Users/btriapitsyn/projects/openchamber && rg -n \"canOverrideDefault\" src/components/chat/ModelControls.tsx",
          "description": "find remaining canOverrideDefault references"
        },
        "output": "311:    const editToggleDisabled = !canOverrideDefault || !currentSessionId || !…",
        "title": "cd /Users/btriapitsyn/projects/openchamber && rg -n \"canOverrideDefault\" src/components/chat/ModelControls.tsx",
        "metadata": {
          "output": "311:    const editToggleDisabled = !canOverrideDefault || !currentSessionId || !currentAgentName;\n",
          "exit": 0,
          "description": "find remaining canOverrideDefault references"
        },
        "time": {
          "start": 1762955073293,
          "end": 1762955073353
        }
      },
      "metadata": {
        "openai": {
          "itemId": "fc_0cc9d0655c1080f70169148f305f20819f8cc415b046768de0"
        }
      }
    },
    {
      "id": "prt_a784f97f8001QNPKTpzawgWJyZ",
      "sessionID": "ses_587d5a922ffe7DqsUjT2Mnbh4Y",
      "messageID": "msg_a784f46a9001FH6xI3ub7xUFg6",
      "type": "step-finish",
      "reason": "tool-calls",
      "snapshot": "11655956d53d426e36d6b3d91f85418e00095d95",
      "cost": 0,
      "tokens": {
        "input": 72669,
        "output": 57,
        "reasoning": 0,
        "cache": {
          "read": 71296,
          "write": 0
        }
      }
    }
  ]
}
```

Analyze our check in place project for showing tools and messages.
Analyze the messages jsons I provided and suggest the changes to avoid such situations.
