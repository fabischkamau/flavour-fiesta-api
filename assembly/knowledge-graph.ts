import {
  AssistantMessage,
  Message,
  OpenAIChatModel,
  Tool,
  ToolCall,
  UserMessage,
} from "@hypermode/modus-sdk-as/models/openai/chat";
import { StringParam, ObjectParam } from "./params";
import { neo4j, models } from "@hypermode/modus-sdk-as";
import { llmWithTools, ResponseWithLogs } from "./tool-helper";
import { JSON } from "json-as";
import { Record } from "@hypermode/modus-sdk-as/assembly/neo4j";

const MODEL_NAME: string = "llm";
const HOST_NAME: string = "neo4jsandbox";

const DEFAULT_PROMPT = `
You are a Chat Assistant answering questions about recipes. You are a Neo4j query expert that helps users interact with the database of Recipes.
First, use the schema provided to understand the available nodes and relationships.
Then, generate an appropriate Cypher query based on the user's question.
Finally, execute the query and provide a natural language response based on the results.
Always validate the schema before generating queries to ensure accuracy.
Treat the data from neo4j as your Knowledge Graph.
Do not use line breaks when constructing your queries.
Always Limit query results to avoid long responses max 25.
Do not mention you are getting answers from neo4j or that you are to help with neo4j queries, just say something like would you like me to help you with recipes?.

Note: You are intelligent to create your own Recipe from provided Data.


Here is the Schema:
erDiagram
    Recipe {
        String id
        String name
        String difficulty
        Int cooking_time
        Int serving_size
        Int calories
        Float cost
        Int popularity_score
        Boolean seasonal_availability
    }

    User {
        String id
        UserPreferences preferences
        String[] favoriteRecipes
    }

    UserPreferences {
        String[] dietaryRestrictions
        String[] allergens
        String[] favoriteCuisines
        String skillLevel
        Int maxCookingTime
    }

    Ingredient {
        String name
        Float amount
        String unit
        String category
    }

    Allergen {
        String name
    }

    Occasion {
        String name
    }

    Season {
        String name
    }

    PreparationStep {
        Int step_number
        String description
    }

    Cuisine {
        String name
    }

    MealPlan {
        String id
        String userId
        String startDate
        String endDate
        PlannedMeal[] meals
    }

    PlannedMeal {
        String recipeId
        String date
        String mealType
        Int servings
    }

    ShoppingList {
        String id
        String userId
        String mealPlanId
        ShoppingItem[] items
        String dateCreated
    }

    ShoppingItem {
        Ingredient ingredient
        Boolean checked
    }

    User ||--|| UserPreferences : "HAS_PREFERENCES"
    User ||--o{ Recipe : "RATED {rating: Int}"
    User ||--o{ Recipe : "PREFERS"
    User ||--o{ Recipe : "FAVORITE"
    Ingredient ||--o{ Recipe : "USED_IN {amount: Float, unit: String}"
    Allergen ||--o{ Recipe : "PRESENT_IN"
    Recipe ||--o{ Occasion : "SUITABLE_FOR"
    Recipe ||--o{ Season : "BEST_IN"
    Recipe ||--o{ PreparationStep : "HAS_STEP"
    Recipe ||--|| Cuisine : "HAS_CUISINE"
    User ||--o{ MealPlan : "HAS_PLAN"
    MealPlan ||--o{ PlannedMeal : "CONTAINS"
    PlannedMeal ||--|| Recipe : "USES"
    MealPlan ||--|| ShoppingList : "HAS_LIST"
    ShoppingList ||--o{ ShoppingItem : "CONTAINS"
    ShoppingItem ||--|| Ingredient : "FOR"
    UserPreferences ||--o{ Allergen : "EXCLUDES"
    UserPreferences ||--o{ Cuisine : "PREFERS"
    User ||--o{ ShoppingList : "HAS_SHOPPING_LIST"
    Recipe ||--o{ PreparationStep : "HAS_STEP {step_number: Int}"
`;


@json
class ThreadResponse extends ResponseWithLogs {
  thread_id: string;
  constructor() {
    super();
    this.thread_id = "";
  }
}


@json
class ThreadResult {
  success: boolean;
  thread_id: string;
  message: string;

  constructor(success: boolean, thread_id: string = "", message: string = "") {
    this.success = success;
    this.thread_id = thread_id;
    this.message = message;
  }
}

function createThread(): ThreadResult {
  const query = `
    CREATE (t:Thread {
      id: randomUuid(),
      created: datetime(),
      last_updated: datetime(),
      status: 'active'
    })
    RETURN t.id as thread_id
  `;

  const response = neo4j.executeQuery(HOST_NAME, query, new neo4j.Variables());

  if (!response || !response.Records || response.Records.length === 0) {
    return new ThreadResult(false, "", "Failed to create thread");
  }

  const thread_id = response.Records[0].getValue<string>("thread_id");

  return new ThreadResult(true, thread_id, "Thread created successfully");
}

export function postNeo4jQuestion(
  question: string,
  thread_id: string | null = null,
): ThreadResponse {
  const model = models.getModel<OpenAIChatModel>(MODEL_NAME);
  const loop_limit: u8 = 10;
  const result = new ThreadResponse();

  // Create or get thread
  if (thread_id === null) {
    const threadResult = createThread();
    if (!threadResult.success) {
      result.logs.push(`Error: ${threadResult.message}`);
      return result;
    }
    result.thread_id = threadResult.thread_id;
  } else {
    result.thread_id = thread_id;
  }

  // Get previous messages
  const previousMessages = getThreadMessages(result.thread_id);

  const response = llmWithTools(
    model,
    [tool_execute_query()],
    DEFAULT_PROMPT,
    question,
    executeToolCall,
    loop_limit,
    previousMessages,
  );

  // Save messages
  const saveResult = saveMessages(
    result.thread_id,
    question,
    response.response,
  );
  if (!saveResult.success) {
    result.logs.push(`Error: ${saveResult.message}`);
    return result;
  }

  result.response = response.response;
  result.logs = response.logs;

  // Update thread last_updated timestamp
  updateThreadTimestamp(result.thread_id);

  return result;
}

function updateThreadTimestamp(thread_id: string): void {
  const query = `
    MATCH (t:Thread {id: $thread_id})
    SET t.last_updated = datetime()
  `;

  const vars = new neo4j.Variables();
  vars.set("thread_id", thread_id);

  neo4j.executeQuery(HOST_NAME, query, vars);
}

function getThreadMessages(thread_id: string): Message[] {
  const query = `
    MATCH (t:Thread)-[:HAS_MESSAGE]->(m)
    WHERE t.id = $thread_id
    RETURN m.role as role, m.content as content, m.datetime as datetime
    ORDER BY m.datetime
  `;
  const vars = new neo4j.Variables();
  vars.set("thread_id", thread_id);

  const response = neo4j.executeQuery(HOST_NAME, query, vars);
  const messages: Message[] = [];

  for (let i = 0; i < response.Records.length; i++) {
    const role = response.Records[i].Values[0].toString();
    const content = response.Records[i].Values[1].toString();

    if (role === "assistant") {
      messages.push(new AssistantMessage(content));
    } else {
      messages.push(new UserMessage(content));
    }
  }

  return messages;
}


@json
class SaveResult {
  success: boolean;
  message: string;

  constructor(success: boolean, message: string) {
    this.success = success;
    this.message = message;
  }
}

function saveMessages(
  thread_id: string,
  question: string,
  answer: string,
): SaveResult {
  // First validate that the thread exists
  const validateQuery = `
    MATCH (t:Thread {id: $thread_id})
    RETURN t
  `;

  const validateVars = new neo4j.Variables();
  validateVars.set("thread_id", thread_id);

  const validateResponse = neo4j.executeQuery(
    HOST_NAME,
    validateQuery,
    validateVars,
  );
  if (!validateResponse || validateResponse.Records.length === 0) {
    return new SaveResult(false, `Thread with id ${thread_id} not found`);
  }

  // Save messages
  const saveQuery = `
    MATCH (t:Thread {id: $thread_id})
    CREATE (um:Message {
      id: randomUuid(),
      role: 'user',
      content: $question,
      datetime: datetime()
    })
    CREATE (am:Message {
      id: randomUuid(),
      role: 'assistant',
      content: $answer,
      datetime: datetime()
    })
    CREATE (t)-[:HAS_MESSAGE]->(um)
    CREATE (t)-[:HAS_MESSAGE]->(am)
    RETURN um.id, am.id
  `;

  const vars = new neo4j.Variables();
  vars.set("thread_id", thread_id);
  vars.set("question", question);
  vars.set("answer", answer);

  const response = neo4j.executeQuery(HOST_NAME, saveQuery, vars);

  if (!response || !response.Records || response.Records.length === 0) {
    return new SaveResult(false, "Failed to save messages");
  }

  return new SaveResult(true, "Messages saved successfully");
}

function executeToolCall(toolCall: ToolCall): string {
  if (toolCall.function.name == "execute_query") {
    return executeCustomQuery(toolCall.function.arguments);
  } else {
    return "";
  }
}

function tool_execute_query(): Tool {
  const execute_query = new Tool();
  const param = new ObjectParam();
  param.addRequiredProperty(
    "query",
    new StringParam("The Cypher query to execute"),
  );
  execute_query.function = {
    name: "execute_query",
    description: `Execute a Cypher query against the Neo4j database and return the results.`,
    parameters: param.toString(),
    strict: true,
  };
  return execute_query;
}


@json
class QueryArguments {
  query: string = "";
}

//bd
function executeCustomQuery(string_args: string): string {
  const args = JSON.parse<QueryArguments>(string_args);
  const response = neo4j.executeQuery(
    HOST_NAME,
    args.query,
    new neo4j.Variables(),
  );

  if (!response) {
    return "Error executing query.";
  }

  let result: string = "";
  for (let i = 0; i < response.Records.length; i++) {
    const current = recordToString(response.Records[i]);
    if (current) {
      result += current + "\n";
    }
  }
  return result || "Query returned no results.";
}

function recordToString(record: Record): string {
  if (!record || !record.Keys || !record.Values) {
    return "";
  }

  const result: string[] = [];
  for (let i = 0; i < record.Keys.length; i++) {
    if (record.Values[i] !== null) {
      result.push(`${record.Keys[i]}: ${record.Values[i]}`);
    }
  }
  return result.join(", ");
}
