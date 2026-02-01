/**
 * LangChain Agent Service for Inventory Management
 * Uses Groq LLM for intelligent inventory rebalancing decisions
 */

const { ChatGroq } = require('@langchain/groq');
const { ChatPromptTemplate, MessagesPlaceholder } = require('@langchain/core/prompts');
const { HumanMessage, AIMessage, SystemMessage, ToolMessage } = require('@langchain/core/messages');
const tools = require('./tools');

// Agent configuration
const GROQ_MODEL = 'llama-3.3-70b-versatile'; // Best model for complex UUID handling

// System prompt for the inventory management agent
const SYSTEM_PROMPT = `You are an intelligent inventory management agent for a battery swapping network.

Your responsibilities:
1. Monitor battery inventory levels across partner stations and warehouses
2. Identify stations with low inventory that need replenishment
3. Identify stations with excess inventory that can donate batteries
4. Create and manage rebalancing requests between stations or from warehouses
5. Approve or reject transfer requests based on network needs.
   - Specifically, you must review requests with status 'PENDING_SENDER_APPROVAL'.
   - For these requests, act as the approval authority for the Source (e.g. Warehouse).
   - Generally approve valid requests unless there is a critical shortage at the source.

When analyzing inventory:
- Stations with ≤2 charged batteries are considered LOW inventory
- Stations with ≥8 batteries are considered HIGH inventory
- Busy score indicates station activity (0-100, higher = more active)
- High busy stations with low inventory should be prioritized

When creating rebalancing requests:
- Always verify source has enough batteries before requesting
- Consider proximity when suggesting transfers
- Provide clear reasons for transfer recommendations
- Set appropriate priority based on urgency

When approving requests:
- Verify the transfer makes sense for the network
- Consider the impact on source station
- Prioritize requests for high-traffic stations
- For 'PENDING_SENDER_APPROVAL' tasks, approve them if the source has sufficient inventory.

Always provide clear, actionable responses with specific station IDs and quantities.`;

/**
 * Create the LLM with tool bindings
 */
const createLLMWithTools = () => {
    const llm = new ChatGroq({
        apiKey: process.env.GROQ_API_KEY,
        model: GROQ_MODEL,
        temperature: 0.1,
        maxTokens: 2048
    });

    // Get all tools and bind them to the LLM
    const agentTools = tools.getAllTools();
    return { llm: llm.bindTools(agentTools), tools: agentTools };
};

// Singleton agent instance
let agentInstance = null;

/**
 * Get or create the LLM with tools
 */
const getLLMWithTools = () => {
    if (!agentInstance) {
        agentInstance = createLLMWithTools();
    }
    return agentInstance;
};

/**
 * Chat history storage (in production, use Redis or database)
 */
const chatHistories = new Map();

/**
 * Get chat history for a session
 */
const getChatHistory = (sessionId) => {
    if (!chatHistories.has(sessionId)) {
        chatHistories.set(sessionId, []);
    }
    return chatHistories.get(sessionId);
};

/**
 * Add message to chat history
 */
const addToHistory = (sessionId, role, content) => {
    const history = getChatHistory(sessionId);
    if (role === 'human') {
        history.push(new HumanMessage(content));
    } else {
        history.push(new AIMessage(content));
    }
    // Keep only last 10 messages
    if (history.length > 20) {
        history.splice(0, 2);
    }
};

/**
 * Clear chat history for a session
 */
const clearHistory = (sessionId) => {
    chatHistories.delete(sessionId);
};

/**
 * Execute a tool by name with given args
 */
const executeTool = async (toolName, args, toolsList) => {
    const tool = toolsList.find(t => t.name === toolName);
    if (!tool) {
        return JSON.stringify({ error: `Tool ${toolName} not found` });
    }
    return await tool.invoke(args || {});
};

/**
 * Process a user request through the agent with tool calling loop
 * @param {string} input - User's request/question
 * @param {string} sessionId - Session ID for conversation history
 * @param {Object} context - Additional context (user role, ID, etc.)
 * @returns {Object} Agent response with output and steps
 */
const processRequest = async (input, sessionId = 'default', context = {}) => {
    try {
        const { llm, tools: toolsList } = getLLMWithTools();
        const chatHistory = getChatHistory(sessionId);

        // Add context to input if provided
        let enhancedInput = input;
        if (context.userRole) {
            enhancedInput = `[User Role: ${context.userRole}] [User ID: ${context.userId || 'unknown'}] ${input}`;
        }

        // Build messages array
        const messages = [
            new SystemMessage(SYSTEM_PROMPT),
            ...chatHistory,
            new HumanMessage(enhancedInput)
        ];

        const toolCalls = [];
        let maxIterations = 10;
        let iteration = 0;

        // Tool calling loop
        while (iteration < maxIterations) {
            iteration++;
            console.log(`[Agent] Calling LLM (Iteration ${iteration}) with ${messages.length} messages...`);
            const response = await llm.invoke(messages);
            console.log(`[Agent] LLM response received:`, JSON.stringify({
                content: response.content,
                tool_calls: response.tool_calls
            }, null, 2));

            // Check if the model wants to call tools
            if (response.tool_calls && response.tool_calls.length > 0) {
                messages.push(response);

                for (const toolCall of response.tool_calls) {
                    console.log(`[Agent] Calling tool: ${toolCall.name} with args:`, toolCall.args);
                    const toolResult = await executeTool(toolCall.name, toolCall.args, toolsList);
                    console.log(`[Agent] Tool result (raw):`, toolResult);

                    let parsedResult;
                    try {
                        parsedResult = typeof toolResult === 'string' ? JSON.parse(toolResult) : toolResult;
                    } catch (e) {
                        parsedResult = toolResult;
                    }

                    toolCalls.push({
                        tool: toolCall.name,
                        input: toolCall.args,
                        output: parsedResult
                    });

                    // Add tool result to messages as ToolMessage
                    messages.push(new ToolMessage({
                        content: typeof toolResult === 'string' ? toolResult : JSON.stringify(toolResult),
                        tool_call_id: toolCall.id
                    }));
                }
            } else {
                // No more tool calls - we have the final response
                const output = response.content;
                console.log(`[Agent] Final Response:`, output);

                // Update chat history
                addToHistory(sessionId, 'human', input);
                addToHistory(sessionId, 'ai', output);

                return {
                    success: true,
                    output,
                    toolCalls,
                    sessionId
                };
            }
        }

        return {
            success: false,
            error: 'Max iterations reached',
            toolCalls,
            sessionId
        };
    } catch (error) {
        console.error('Agent error:', error);
        return {
            success: false,
            error: error.message,
            sessionId
        };
    }
};

/**
 * Predefined agent actions for common operations
 */
const agentActions = {
    /**
     * Analyze network and get rebalancing recommendations
     */
    analyzeNetwork: async (sessionId = 'system') => {
        return processRequest(
            'Analyze the current network inventory status and provide rebalancing recommendations.',
            sessionId,
            { userRole: 'SYSTEM', userId: 'auto-analyzer' }
        );
    },

    /**
     * Request rebalancing for a specific station
     */
    requestRebalancing: async (targetStationId, sessionId = 'default') => {
        return processRequest(
            `Station ${targetStationId} needs more batteries. Find the best source (warehouse or nearby station with surplus) and create a rebalancing request.`,
            sessionId,
            { userRole: 'SYSTEM', userId: 'rebalancer' }
        );
    },

    /**
     * Get status of a specific station
     */
    getStationStatus: async (stationId, sessionId = 'default') => {
        return processRequest(
            `What is the current inventory status of station ${stationId}? Include battery counts and busy score.`,
            sessionId,
            { userRole: 'OPERATOR', userId: 'status-checker' }
        );
    },

    /**
     * Approve all high-priority pending tasks
     */
    autoApproveHighPriority: async (approverId, sessionId = 'system') => {
        return processRequest(
            `List all pending transfer tasks. For any task marked as HIGH or CRITICAL priority, approve them on behalf of approver ${approverId}.`,
            sessionId,
            { userRole: 'WAREHOUSE', userId: approverId }
        );
    },

    /**
     * Approve pending transfer requests (AI Auto-Approval)
     */
    approvePendingTransfers: async (sessionId = 'system') => {
        return processRequest(
            `1. Fetch pending tasks using get_pending_transfer_tasks.
             2. FOR EACH TASK:
                a. COPY the EXACT UUID 'id' from the task list.
                b. Approve using approve_rebalancing_request with that UUID.
             Use ONLY the real UUIDs you receive from tools.`,
            sessionId,
            { userRole: 'SYSTEM', userId: 'AI_AGENT' }
        );
    }
};

module.exports = {
    createLLMWithTools,
    getLLMWithTools,
    processRequest,
    agentActions,
    getChatHistory,
    clearHistory
};
