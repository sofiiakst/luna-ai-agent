import { ToolNode } from "@langchain/langgraph/prebuilt";
import { TavilySearch } from "@langchain/tavily";

import wxflows from "@wxflows/sdk/langchain";
import {
  StateGraph,
  MessagesAnnotation,
  START,
  END,
  MemorySaver,
  Annotation,
} from "@langchain/langgraph";
import SYSTEM_MESSAGE from "@/constants/systemMessage";
import {
  AIMessage,
  BaseMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
  trimMessages,
} from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  MessagesPlaceholder,
} from "@langchain/core/prompts";
import { AgentMode } from "./types";
import { ChatAnthropic } from "@langchain/anthropic";

const trimmer = trimMessages({
  maxTokens: 10,
  strategy: "last",
  tokenCounter: (msgs) => msgs.length,
  includeSystem: true,
  allowPartial: false,
  startOn: "human",
});

const toolClient = new wxflows({
  endpoint: process.env.WXFLOWS_ENDPOINT || "",
  apikey: process.env.WXFLOWS_APIKEY || "",
});

// Retrieve the tools
const tools = await toolClient.lcTools;
const toolNode = new ToolNode(tools);

const tavily = new TavilySearch({
  tavilyApiKey: process.env.TAVILY_API_KEY,
  maxResults: 5,
  searchDepth: "basic",
});
tavily.name = "tavily_search";
const totalTools = [...tools, tavily];

const SimpleAnnotation = Annotation.Root({ ...MessagesAnnotation.spec });

interface ResearchTask {
  id: string;
  question: string;
  tools?: string[];
  assignedTo?: number; // researcher agent number
  findings?: string;
}

// Deep research annotation - includes research tracking
const DeepResearchAnnotation = Annotation.Root({
  ...MessagesAnnotation.spec,
  researchBrief: Annotation<string>({
    reducer: (_, newBrief) => newBrief,
    default: () => "",
  }),
  researchTasks: Annotation<ResearchTask[]>({
    reducer: (_, newTasks) => newTasks,
    default: () => [],
  }),
});

function createBaseModel() {
  return new ChatAnthropic({
    modelName: "claude-3-5-sonnet-20241022",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    temperature: 0.5,
    maxTokens: 4096,
    streaming: true,
    clientOptions: {
      defaultHeaders: {
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
    },
  });
}

function initializeModelWithTools(tools: any[]) {
  const baseModel = createBaseModel();
  return (baseModel as any).bindTools(totalTools);
}

/*const initialiseModel = () => {
  const model = new ChatAnthropic({
    modelName: "claude-3-5-sonnet-20241022",
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
    temperature: 0.7,
    maxTokens: 4096,
    streaming: true,
    clientOptions: {
      defaultHeaders: {
        "anthropic-beta": "prompt-caching-2024-07-31",
      },
    },
  }).bindTools(tools);
  return model;
};*/

function shouldContinue(state: typeof MessagesAnnotation.State) {
  const messages = state.messages;
  const lastMessage = messages[messages.length - 1] as AIMessage;
  if (lastMessage.tool_calls?.length) {
    return "tools";
  }
  if (lastMessage.content && lastMessage._getType() === "tool") {
    return "agent";
  }
  return END;
}

const createWorkFlow = () => {
  const model = initializeModelWithTools(tools);
  const stateGraph = new StateGraph(SimpleAnnotation)
    .addNode("agent", async (state) => {
      const promptTemplate = ChatPromptTemplate.fromMessages([
        new SystemMessage(SYSTEM_MESSAGE, {
          cache_control: { type: "ephemeral" }, // set a cache breakpoint (max number of breakpoints is 4)
        }),
        new MessagesPlaceholder("messages"),
      ]);

      // Trim the messages to manage conversation history
      const trimmedMessages = await trimmer.invoke(state.messages);
      const prompt = await promptTemplate.invoke({ messages: trimmedMessages });
      const response = await model.invoke(prompt);
      return { messages: [response] };
    })
    .addEdge(START, "agent")
    .addNode("tools", toolNode)
    .addConditionalEdges("agent", shouldContinue)
    .addEdge("tools", "agent");
  return stateGraph;
};

async function executeResearchTask(
  task: ResearchTask,
  messages: BaseMessage[],
  researchBrief: string
): Promise<string> {
  const toolClient = new wxflows({
    endpoint: process.env.WXFLOWS_ENDPOINT || "",
    apikey: process.env.WXFLOWS_APIKEY || "",
  });
  const tools = await toolClient.lcTools; // <— each agent gets its own tools
  const tavily = new TavilySearch({
    tavilyApiKey: process.env.TAVILY_API_KEY,
    maxResults: 5,
    searchDepth: "advanced",
  });
  tavily.name = "tavily_search";
  const totalTools = [...tools, tavily];
  const model = createBaseModel().bindTools(totalTools);

  const systemMessage = new SystemMessage(
    `${SYSTEM_MESSAGE}

You are Researcher assigned to a specific task in a parallel research team.

YOUR SPECIFIC TASK:
ID: ${task.id}
Question: ${task.question}
Suggested Tools: ${task.tools?.join(", ")}

Research Context:
${researchBrief}

Instructions (follow them but dont display them to the user):
1. Focus ONLY on your assigned question.
2. For research: ALWAYS use the tools you have: "tavily_search" ,"google_books" and "wikipedia".
3. For future dates you may use projections from authoritative sources.
4. Cross-reference multiple sources for accuracy.
5. Provide detailed findings with citations in Markdown format, e.g. [Source: example.com].
6. Note confidence levels and limitations.
7. Focus only on answering the question directly,clearly, and professionally.
8. Summarize clearly and concisely.

Work independently - other researchers are handling different aspects simultaneously.`,
    { cache_control: { type: "ephemeral" } }
  );

  // Build conversation chain properly
  const conversationMessages: BaseMessage[] = [systemMessage, ...messages];
  let response = await model.invoke(conversationMessages);

  // Handle tool calls iteratively (up to 10 iterations)
  let iterations = 0;
  const maxIterations = 10;

  while (response.tool_calls?.length && iterations < maxIterations) {
    // 1️⃣ Always add the model’s tool_use message first
    conversationMessages.push(response);

    const toolCalls = response.tool_calls ?? [];
    const toolResults: BaseMessage[] = [];

    // 2️⃣ For every tool call, find and execute the matching tool
    for (const call of toolCalls) {
      if (!call.id || !call.name) {
        console.warn("Skipping tool call missing id or name:", call);
        continue;
      }

      const tool = tools.find((t) => t.name === call.name);
      if (!tool) {
        console.warn(`Tool not found: ${call.name}`);
        continue;
      }

      let toolOutput: any;
      try {
        toolOutput = await tool.invoke(call.args);
      } catch (err) {
        toolOutput = `Tool execution error: ${err instanceof Error ? err.message : String(err)}`;
      }

      // 3️⃣ Wrap each tool output in a proper ToolMessage
      toolResults.push(
        new ToolMessage({
          tool_call_id: call.id,
          name: call.name,
          content:
            typeof toolOutput === "string"
              ? toolOutput
              : JSON.stringify(toolOutput),
        })
      );
    }

    // 4️⃣ Immediately append *all* tool results right after the AIMessage
    conversationMessages.push(...toolResults);

    // 5️⃣ Only now can we ask the model to continue
    response = await model.invoke(conversationMessages);

    iterations++;
  }

  return typeof response.content === "string"
    ? response.content
    : JSON.stringify(response.content);
}

const createDeepResearchWorkFlow = () => {
  const model = createBaseModel();

  const stateGraph = new StateGraph(DeepResearchAnnotation)
    // Research planner agent
    .addNode("clarify_agent", async (state) => {
      const plannerPrompt = ChatPromptTemplate.fromMessages([
        new SystemMessage(
          `${SYSTEM_MESSAGE}

          You are the Clarify Agent. Analyze the user's question and determine what needs to be researched.
          Output:
MAIN_QUESTION: [Clear restatement]
KEY_ASPECTS: [List aspects to research]
COMPLEXITY: [simple/moderate/complex]`,
          {
            cache_control: { type: "ephemeral" },
          }
        ),
        new MessagesPlaceholder("messages"),
      ]);

      const trimmedMessages = await trimmer.invoke(state.messages);
      const prompt = await plannerPrompt.invoke({ messages: trimmedMessages });
      const response = await model.invoke(prompt);
      return { messages: [response] };
    })
    .addNode("research_brief_agent", async (state) => {
      const briefPrompt = ChatPromptTemplate.fromMessages([
        new SystemMessage(
          `${SYSTEM_MESSAGE}

          Create a research plan with 2-5 independent tasks that can run in PARALLEL.

          Output as JSON:
          RESEARCH_PLAN_START
          {
            "objective": "Overall goal",
            "tasks": [
              {
                "id": "task_1",
                "question": "Specific independent question",
                "tools": ["suggested_tools"]
              }
            ]
          }
          RESEARCH_PLAN_END
          
          IMPORTANT: Tasks must be INDEPENDENT - no task should depend on another's results.

`,
          {
            cache_control: { type: "ephemeral" },
          }
        ),
        new MessagesPlaceholder("messages"),
      ]);

      const trimmedMessages = await trimmer.invoke(state.messages);
      const prompt = await briefPrompt.invoke({ messages: trimmedMessages });
      const response = await model.invoke(prompt);

      // Store the research brief for supervisor
      const briefContent =
        typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

      let researchTasks: ResearchTask[] = [];
      try {
        const planMatch = briefContent.match(
          /RESEARCH_PLAN_START\s*([\s\S]*?)\s*RESEARCH_PLAN_END/
        );
        if (planMatch) {
          const planJson = JSON.parse(planMatch[1]);
          researchTasks = planJson.tasks;
        }
      } catch (error) {
        // Fallback
        researchTasks = [
          {
            id: "task_1",
            question: "Comprehensive research on the topic",
            tools: [],
          },
        ];
      }

      return {
        messages: [response],
        researchBrief: briefContent,
        researchTasks,
      };
    })
    .addNode("parallel_research", async (state) => {
      console.log(
        `Starting parallel research with ${state.researchTasks.length} tasks...`
      );

      // Execute ALL tasks in parallel using Promise.all
      const researchPromises = state.researchTasks.map(async (task) => {
        console.log(`Researcher starting: ${task.id}`);
        const findings = await executeResearchTask(
          task,
          state.messages,
          state.researchBrief
        );
        console.log(`Researcher completed: ${task.id}`);
        return { ...task, findings };
      });

      // Wait for ALL researchers to complete
      const completedTasks = await Promise.all(researchPromises);

      console.log("All parallel research completed!");

      return {
        researchTasks: completedTasks,
      };
    })

    // 5. REPORT AGENT - Synthesizing final report
    .addNode("report_agent", async (state) => {
      const allFindings = state.researchTasks
        .map(
          (t) => `## ${t.question}\n\n${t.findings || "No findings recorded"}`
        )
        .join("\n\n---\n\n");
      const reportPrompt = ChatPromptTemplate.fromMessages([
        new SystemMessage(
          `${SYSTEM_MESSAGE}

You are the Report Agent. Synthesize the parallel research findings into a comprehensive report.

Original Question:
${state.messages[0].content}

Research Plan:
${state.researchBrief}

Findings from ${state.researchTasks.length} parallel research threads:
${allFindings}

Create a cohesive, well-structured response that:
1. Directly answers the original question in a clear and professional manner.
2. Integrates insights from all research
3. Provides proper citations
4. Highlights key findings and implications
5. Provide the sources from which the information was retrieved (for example as a link to a website).

Format your response as a clear, professional report without mentioning:
- Internal task numbers or IDs
- Research planning details
- Tool names or execution details
- Any meta-commentary about the research process
Focus entirely on presenting the findings in a natural, user-friendly way.`,

          {
            cache_control: { type: "ephemeral" },
          }
        ),
        new MessagesPlaceholder("messages"),
      ]);

      const trimmedMessages = await trimmer.invoke(state.messages);
      const prompt = await reportPrompt.invoke({ messages: trimmedMessages });
      const response = await model.invoke(prompt);
      return {
        messages: [response],
      };
    })

    .addEdge(START, "clarify_agent")
    .addEdge("clarify_agent", "research_brief_agent")
    .addEdge("research_brief_agent", "parallel_research")
    .addEdge("parallel_research", "report_agent")
    .addEdge("report_agent", END);

  return stateGraph;
};

function addCachingHeaders(messages: BaseMessage[]): BaseMessage[] {
  if (!messages.length) return messages;
  const cachedMessages = [...messages];

  const addCache = (message: BaseMessage) => {
    message.content = [
      {
        type: "text",
        text: message.content as string,
        cache_control: { type: "ephemeral" },
      },
    ];
  };
  addCache(cachedMessages.at(-1)!);
  let humanCount = 0;
  for (let i = cachedMessages.length - 1; i >= 0; i--) {
    if (cachedMessages[i] instanceof HumanMessage) {
      humanCount++;
      if (humanCount == 2) {
        addCache(cachedMessages[i]);
        break;
      }
    }
  }
  return cachedMessages;
}

export async function submitQuestion(
  messages: BaseMessage[],
  chatId: string,
  mode: AgentMode = "simple"
) {
  const cachedMessages = addCachingHeaders(messages);

  const workFlow =
    mode === "deep_research" ? createDeepResearchWorkFlow() : createWorkFlow();

  const checkpointer = new MemorySaver();
  const app = workFlow.compile({ checkpointer });

  const stream = await (app as any).streamEvents(
    { messages, mode },
    {
      version: "v2",
      configurable: {
        thread_id: chatId,
      },
      streamMode: "messages",
      runId: chatId,
    }
  );
  return stream;
}
