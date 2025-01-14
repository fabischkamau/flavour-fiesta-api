import { neo4j } from "@hypermode/modus-sdk-as";
import {
  MealPlan,
  PlannedMeal,
  Recipe,
  SearchResult,
  ShoppingList,
  User,
  UserPreferences,
  ShoppingItem,
  UserPreferencesResponse ,
} from "./classes";
import { JSON } from "json-as";

const hostName = "neo4jsandbox";

/**
 * Get random recipes
 * @param limit Number of recipes to return
 */
export function getRandomRecipes(limit: i32 = 5): Recipe[] {
  const vars = new neo4j.Variables();
  vars.set("limit", limit);

  const query = `
MATCH (r:Recipe)

// Get all related data for the recipe
MATCH (r)<-[:USED_IN]-(i:Ingredient)
MATCH (r)<-[:PRESENT_IN]-(a:Allergen)
MATCH (r)-[:HAS_CUISINE]->(c:Cuisine)
MATCH (r)-[:SUITABLE_FOR]->(o:Occasion)
MATCH (r)-[:BEST_IN]->(s:Season)
MATCH (r)-[:HAS_STEP]->(p:PreparationStep)
MATCH (r)<-[rate:RATED]-()

// Collect all related data
WITH DISTINCT r,
     collect(DISTINCT i.name) AS ingredients,
     collect(DISTINCT a.name) AS allergens,
     c.name AS cuisine,
     collect(DISTINCT o.name) AS occasions,
     collect(DISTINCT s.name) AS seasons,
     collect(DISTINCT p.description) AS preparationSteps,
     avg(rate.rating) AS rating

RETURN {
  id: r.id,
  name: r.name,
  difficulty: r.difficulty,
  cookingTime: r.cooking_time,
  servingSize: r.serving_size,
  calories: r.calories,
  cost: r.cost,
  popularityScore: r.popularity_score,
  seasonalAvailability: r.seasonal_availability,
  ingredients: ingredients,
  allergens: allergens,
  cuisine: cuisine,
  occasions: occasions,
  seasons: seasons,
  preparationSteps: preparationSteps,
  rating: coalesce(rating, 0.0)
} AS recipe
LIMIT toInteger($limit)
    `;

  const result = neo4j.executeQuery(hostName, query, vars);
  const recipe: Recipe[] = [];
  for (let i = 0; i < result.Records.length; i++) {
    recipe.push(JSON.parse<Recipe>(result.Records[i].get("recipe")));
  }
  return recipe;
}

/**
 * Get a single random recipe
 */
export function getRandomRecipe(): Recipe | null {
  const recipes = getRandomRecipes(1);
  return recipes.length > 0 ? recipes[0] : null;
}

/**
 * Create a new user with preferences
 */
export function createUser(
  id: string,
  email: string,
  name: string,
  allergens: string[] = [], // Made optional with default empty array
  favoriteCuisines: string[] = [], // Made optional with default empty array
  skillLevel: string = "beginner", // Added default skill level
): boolean {
  const preferences = new UserPreferences();
  // Set defaults for dietary preferences
  preferences.allergens = allergens;
  preferences.favoriteCuisines =
    favoriteCuisines.length > 0
      ? favoriteCuisines
      : ["Italian", "American", "Mexican"]; // Default cuisines if none provided
  preferences.skillLevel = skillLevel;
  preferences.dietaryRestrictions = []; // Default empty dietary restrictions

  const user = new User(id, email, name, preferences);

  const vars = new neo4j.Variables();
  vars.set("user", user);

  const query = `
  // Create user node
  CREATE (u:User {
    id: $user.id,
    email: $user.email,
    name: $user.name
  })
  
  // Create preferences node with defaults
  CREATE (p:UserPreferences {
    dietaryRestrictions: $user.preferences.dietaryRestrictions,
    allergens: $user.preferences.allergens,
    favoriteCuisines: $user.preferences.favoriteCuisines,
    skillLevel: $user.preferences.skillLevel
  })
  CREATE (u)-[:HAS_PREFERENCES]->(p)
  
  // Connect allergens if any
  WITH u, p
  UNWIND $user.preferences.allergens as allergen
  MERGE (a:Allergen {name: allergen})
  CREATE (p)-[:EXCLUDES]->(a)
  
  // Connect favorite cuisines
  WITH u, p
  UNWIND $user.preferences.favoriteCuisines as cuisine
  MERGE (c:Cuisine {name: cuisine})
  CREATE (p)-[:PREFERS]->(c)
  
  RETURN true as success
  `;

  const result = neo4j.executeQuery(hostName, query, vars);
  return true;
}

/**
 * Update user preferences
 * @param userId - ID of the user to update
 * @param allergens - Optional array of allergens
 * @param favoriteCuisines - Optional array of favorite cuisines
 * @param skillLevel - Optional skill level
 * @param dietaryRestrictions - Optional array of dietary restrictions
 * @returns boolean indicating success of the update
 */
export function updateUserPreferences(
    userId: string,
    allergens: Array<string> | null,
    favoriteCuisines: Array<string> | null,
    skillLevel: string | null,
    dietaryRestrictions: Array<string> | null
): bool {
    const vars = new neo4j.Variables();
    vars.set("userId", userId);

    if (allergens !== null) {
        vars.set("allergens", allergens);
    }
    if (favoriteCuisines !== null) {
        vars.set("favoriteCuisines", favoriteCuisines);
    }
    if (skillLevel !== null) {
        vars.set("skillLevel", skillLevel);
    }
    if (dietaryRestrictions !== null) {
        vars.set("dietaryRestrictions", dietaryRestrictions);
    }

    const updateClauses: Array<string> = [];
    if (allergens !== null) {
        updateClauses.push("p.allergens = $allergens");
    }
    if (favoriteCuisines !== null) {
        updateClauses.push("p.favoriteCuisines = $favoriteCuisines");
    }
    if (skillLevel !== null) {
        updateClauses.push("p.skillLevel = $skillLevel");
    }
    if (dietaryRestrictions !== null) {
        updateClauses.push("p.dietaryRestrictions = $dietaryRestrictions");
    }

    const setClauses = updateClauses.length > 0 ? `SET ${updateClauses.join(", ")}` : "";

    const query = `
        MATCH (u:User {id: $userId})
        MERGE (u)-[:HAS_PREFERENCES]->(p:UserPreferences)
        ${setClauses}

        ${allergens !== null ? `
        WITH p
        OPTIONAL MATCH (p)-[r:EXCLUDES]->(:Allergen)
        DELETE r
        WITH p
        UNWIND $allergens as allergen
        MERGE (a:Allergen {name: allergen})
        CREATE (p)-[:EXCLUDES]->(a)
        ` : ''}

        ${favoriteCuisines !== null ? `
        WITH p
        OPTIONAL MATCH (p)-[r:PREFERS]->(:Cuisine)
        DELETE r
        WITH p
        UNWIND $favoriteCuisines as cuisine
        MERGE (c:Cuisine {name: cuisine})
        CREATE (p)-[:PREFERS]->(c)
        ` : ''}

        RETURN true as success
    `;

    const result = neo4j.executeQuery(hostName, query, vars);
    return true;
}

/**
 * Get user preferences
 * @param userId - ID of the user to retrieve preferences
 * @returns UserPreferences object or null if not found
 */
export function getUserPreferences(userId: string): UserPreferencesResponse  | null {
  const vars = new neo4j.Variables();
  vars.set("userId", userId);
  console.log(userId);

  const query = `
// Match user and their preferences
MATCH (u:User{id:$userId})-[:HAS_PREFERENCES]->(p)
// Retrieve preferences properties
OPTIONAL MATCH (p)-[:EXCLUDES]->(a:Allergen)
OPTIONAL MATCH (p)-[:PREFERS]->(c:Cuisine)
WITH p.dietaryRestrictions AS dietaryRestrictions,
     p.skillLevel AS skillLevel,
     collect(DISTINCT a.name) AS allergens,
     collect(DISTINCT c.name) AS favoriteCuisines
RETURN {
  dietaryRestrictions: dietaryRestrictions,
  allergens: allergens,
  favoriteCuisines: favoriteCuisines,
  skillLevel: skillLevel
} AS preferences

  `;

  const result = neo4j.executeQuery(hostName, query, vars);

  // Parse the result into the UserPreferences class
  if (result.Records.length > 0) {
    const preferencesData = result.Records[0].get("preferences");
    const preferences: UserPreferencesResponse  = JSON.parse<UserPreferencesResponse >(
      preferencesData
    );

    return preferences;
  }

  // Return null if no preferences are found
  return null;
}


/**
 * Get a user by ID with all their preferences and relationships
 */
export function getUserFavouriteRecipe(
  userId: string,
  limit: i32 = 5,
): Recipe[] {
  const vars = new neo4j.Variables();
  vars.set("userId", userId);
  vars.set("limit", limit);

  const query = `
    MATCH (u:User {id: $userId})
    MATCH (u)-[:FAVORITE]->(r:Recipe)
      MATCH (r)<-[:USED_IN]-(i:Ingredient)
    MATCH (r)<-[:PRESENT_IN]-(a:Allergen)
    MATCH (r)-[:HAS_CUISINE]->(c:Cuisine)
    MATCH (r)-[:SUITABLE_FOR]->(o:Occasion)
    MATCH (r)-[:BEST_IN]->(s:Season)
    MATCH (r)-[:HAS_STEP]->(p:PreparationStep)
    MATCH(r)<-[rate:RATED]-()
    
 // Collect all related data
WITH DISTINCT r,
     collect(DISTINCT i.name) AS ingredients,
     collect(DISTINCT a.name) AS allergens,
     c.name AS cuisine,
     collect(DISTINCT o.name) AS occasions,
     collect(DISTINCT s.name) AS seasons,
     collect(DISTINCT p.description) AS preparationSteps,
     avg(rate.rating) AS rating

RETURN {
  id: r.id,
  name: r.name,
  difficulty: r.difficulty,
  cookingTime: r.cooking_time,
  servingSize: r.serving_size,
  calories: r.calories,
  cost: r.cost,
  popularityScore: r.popularity_score,
  seasonalAvailability: r.seasonal_availability,
  ingredients: ingredients,
  allergens: allergens,
  cuisine: cuisine,
  occasions: occasions,
  seasons: seasons,
  preparationSteps: preparationSteps,
  rating: coalesce(rating, 0.0)
} AS recipe
LIMIT toInteger($limit)
    `;

  const result = neo4j.executeQuery(hostName, query, vars);
  const recipe: Recipe[] = [];
  for (let i = 0; i < result.Records.length; i++) {
    recipe.push(JSON.parse<Recipe>(result.Records[i].get("recipe")));
  }
  return recipe;
}

/**
 * Rate a recipe with proper relationship
 */
export function addRateRecipe(
  userId: string,
  recipeId: string,
  rating: i32,
): boolean {
  const vars = new neo4j.Variables();
  vars.set("userId", userId);
  vars.set("recipeId", recipeId);
  vars.set("rating", rating);

  const query = `
  MATCH (u:User {id: $userId}), (r:Recipe {id: $recipeId})
  MERGE (u)-[rate:RATED]->(r)
  SET rate.rating = $rating
  
  WITH r
  MATCH (r)<-[ratings:RATED]-()
  WITH r, avg(ratings.rating) as avgRating, count(ratings) as numRatings
  SET r.rating = avgRating,
      r.numberOfRatings = numRatings
  
  RETURN true as success
  `;

  neo4j.executeQuery(hostName, query, vars);
  return true;
}

/**
 * Save a recipe to user's favorites using PREFERS relationship
 */
export function saveFavoriteRecipe(userId: string, recipeId: string): boolean {
  const vars = new neo4j.Variables();
  vars.set("userId", userId);
  vars.set("recipeId", recipeId);

  const query = `
  MATCH (u:User {id: $userId}), (r:Recipe {id: $recipeId})
  MERGE (u)-[f:FAVORITE]->(r)
  RETURN true as success
  `;

  neo4j.executeQuery(hostName, query, vars);
  return true;
}

/**
 *  Remove recipe from user's favorites using PREFERS relationship
 */
export function deleteFavoriteRecipe(
  userId: string,
  recipeId: string,
): boolean {
  const vars = new neo4j.Variables();
  vars.set("userId", userId);
  vars.set("recipeId", recipeId);

  const query = `
  MATCH (u:User {id: $userId}), (r:Recipe {id: $recipeId})
  MATCH (u)-[f:FAVORITE]->(r)
  DELETE f
  RETURN true as success
  `;

  neo4j.executeQuery(hostName, query, vars);
  return true;
}

/**
 * Create a meal plan with proper relationships
 */
export function createMealPlan(
  userId: string,
  startDate: string,
  endDate: string,
): MealPlan {
  const mealPlan = new MealPlan("", userId, startDate, endDate);

  const vars = new neo4j.Variables();
  vars.set("mealPlan", mealPlan);

  const query = `
MATCH (u:User {id: $mealPlan.userId})
CREATE (mp:MealPlan {
  id: randomUUID(),
  startDate: datetime($mealPlan.startDate),
  endDate: datetime($mealPlan.endDate)
})
CREATE (u)-[:HAS_PLAN]->(mp)
WITH mp, u
WITH {
  id: mp.id,
  userId: u.id,
  startDate: mp.startDate,
  endDate: mp.endDate,
  meals: []
} as mealplan
RETURN mealplan

  `;

  const result = neo4j.executeQuery(hostName, query, vars);

  return JSON.parse<MealPlan>(result.Records[0].get("mealplan"));
}

/**
 * Add a meal to plan with proper relationships
 */
export function addMealToPlan(
  mealPlanId: string,
  recipeId: string,
  date: string,
  mealType: string,
  servings: i32,
): boolean {
  const meal = new PlannedMeal(recipeId, date, mealType, servings);

  const vars = new neo4j.Variables();
  vars.set("mealPlanId", mealPlanId);
  vars.set("meal", meal);

  const query = `
  MATCH (mp:MealPlan {id: $mealPlanId}), (r:Recipe {id: $meal.recipeId})
  CREATE (pm:PlannedMeal {
    recipeId: $meal.recipeId,
    date: datetime($meal.date),
    mealType: $meal.mealType,
    servings: $meal.servings
  })
  CREATE (mp)-[:CONTAINS]->(pm)
  CREATE (pm)-[:USES]->(r)
  RETURN true as success
  `;

  const result = neo4j.executeQuery(hostName, query, vars);
  return true;
}

/**
 * Generate a shopping list from a meal plan with proper relationships
 */
export function createShoppingList(
  mealPlanId: string,
  userId: string,
): boolean {
  const vars = new neo4j.Variables();
  vars.set("mealPlanId", mealPlanId);
  vars.set("userId", userId);

  const query = `
MATCH (mp:MealPlan {id: $mealPlanId})
MATCH (mp)-[:CONTAINS]->(pm:PlannedMeal)-[:USES]->(r:Recipe)
MATCH (i:Ingredient)-[:USED_IN]->(r)
WITH mp, COLLECT(DISTINCT i) AS ingredients

// Create a single ShoppingList
CREATE (sl:ShoppingList {
  id: randomUUID(),
  dateCreated: datetime()
})

// Pass the created ShoppingList to the next part of the query
WITH sl, mp, ingredients
MATCH (u:User {id: $userId})
MERGE (u)-[:HAS_SHOPPING_LIST]->(sl)
MERGE (mp)-[:HAS_LIST]->(sl)

// Add ShoppingItems to the ShoppingList
WITH sl, ingredients
UNWIND ingredients AS i
CREATE (si:ShoppingItem {
  ingredient: i.name,
  checked: false
})
MERGE (sl)-[:CONTAINS]->(si)
MERGE (si)-[:FOR]->(i)

RETURN true AS success

`;

  const result = neo4j.executeQuery(hostName, query, vars);
  return result.Records[0].getValue<boolean>("success");
}

/**
 * Update shopping list item with proper relationships
 */
export function updateShoppingListItem(
  shoppingListId: string,
  ingredient: string,
  checked: boolean,
): boolean {
  const vars = new neo4j.Variables();
  vars.set("shoppingListId", shoppingListId);
  vars.set("ingredient", ingredient);
  vars.set("checked", checked);

  const query = `
  MATCH (sl:ShoppingList {id: $shoppingListId})
  MATCH (sl)-[:CONTAINS]->(si:ShoppingItem)-[:FOR]->(i:Ingredient {name: $ingredient})
  SET si.checked = $checked
  RETURN true as success
  `;

  const result = neo4j.executeQuery(hostName, query, vars);
  return result.Records[0].getValue<boolean>("success");
}

/**
 * Get User shopping List by MealPlan id
 * Returns null if no shopping list is found
 */
export function getMealPlanShoppingList(
  mealPlanId: string,
): ShoppingList | null {
  const vars = new neo4j.Variables();
  vars.set("mealPlanId", mealPlanId);

  const query = `
  MATCH (u:User)-[:HAS_PLAN]->(mp:MealPlan {id: $mealPlanId})
  OPTIONAL MATCH (mp)-[:HAS_LIST]->(sl:ShoppingList)
  OPTIONAL MATCH (sl)-[:CONTAINS]->(si:ShoppingItem)-[:FOR]->(i:Ingredient)
  WITH u, mp, sl, collect({
    ingredient: i.name,
    checked: si.checked
  }) as items
  WHERE sl IS NOT NULL
  RETURN {
    id: sl.id,
    userId: u.id,
    mealPlanId: mp.id,
    dateCreated: toString(sl.dateCreated),
    items: items
  } as shoppingList
  `;

  const result = neo4j.executeQuery(hostName, query, vars);

  // Check if we have any records before trying to access them
  if (result.Records.length === 0) {
    return null;
  }

  return JSON.parse<ShoppingList>(result.Records[0].get("shoppingList"));
}
/**
 * Get meal plans by date range with proper relationships
 */
export function getMealPlansInDateRange(
  userId: string,
  startDate: string,
  endDate: string,
): MealPlan[] {
  const vars = new neo4j.Variables();
  vars.set("userId", userId);
  vars.set("startDate", startDate);
  vars.set("endDate", endDate);

  const query = `
  MATCH (u:User {id: $userId})-[:HAS_PLAN]->(mp:MealPlan)
  WHERE datetime($startDate) <= mp.startDate <= datetime($endDate)
  
  WITH mp
  MATCH (mp)-[:CONTAINS]->(pm:PlannedMeal)-[:USES]->(r:Recipe)
  
  WITH mp, 
       collect({
         recipeId: pm.recipeId,
         date: toString(pm.date),
         mealType: pm.mealType,
         servings: pm.servings
       }) as meals
  
  RETURN {
    id: mp.id,
    userId: mp.userId,
    startDate: toString(mp.startDate),
    endDate: toString(mp.endDate),
    meals: meals
  } as mealPlan
  `;

  const result = neo4j.executeQuery(hostName, query, vars);
  const mealPlans: MealPlan[] = [];
  for (let i = 0; i < result.Records.length; i++) {
    const record = result.Records[i];
    mealPlans.push(record.getValue<MealPlan>("mealPlan"));
  }
  return mealPlans;
}

/**
 * Get personalized recommendations using proper relationship traversal
 */
export function getPersonalizedRecommendations(
  userId: string,
  limit: i32 = 5,
): Recipe[] {
  const vars = new neo4j.Variables();
  vars.set("userId", userId);
  vars.set("limit", limit);

  const query = `
    // Start with user and their preferences
    MATCH (u:User {id: $userId})-[:HAS_PREFERENCES]->(p:UserPreferences)

    // Collect user preferences
    OPTIONAL MATCH (p)-[:PREFERS]->(favCuisine:Cuisine)
    OPTIONAL MATCH (p)-[:EXCLUDES]->(allergen:Allergen)
    WITH u, p,
         collect(DISTINCT favCuisine.name) as userCuisines,
         collect(DISTINCT allergen.name) as userAllergens

    // Find all recipes first
    MATCH (r:Recipe)
    WHERE NOT EXISTS {
      MATCH (r)-[:CONTAINS_ALLERGEN]->(a:Allergen)
      WHERE a.name IN userAllergens
    }

    // Match required relationships with OPTIONAL to prevent null results
    OPTIONAL MATCH (r)-[:HAS_CUISINE]->(c:Cuisine)
    OPTIONAL MATCH (r)-[:CONTAINS]->(i:Ingredient)
    OPTIONAL MATCH (r)-[:SUITABLE_FOR]->(o:Occasion)
    OPTIONAL MATCH (r)-[:BEST_IN]->(s:Season)
    OPTIONAL MATCH (r)-[:HAS_STEP]->(step:PreparationStep)

    // Calculate rating
    OPTIONAL MATCH (r)<-[rating:RATED]-()
    WITH r, c, collect(DISTINCT i.name) as ingredients,
         collect(DISTINCT o.name) as occasions,
         collect(DISTINCT s.name) as seasons,
         collect(DISTINCT step.description) as preparationSteps,
         p.skillLevel as userSkillLevel,
         userCuisines,
         CASE
           WHEN count(rating) > 0 THEN round(10 * avg(rating.rating)) / 10
           ELSE 0.0
         END as avgRating

    // Calculate current season
    WITH r, c, ingredients, occasions, seasons, preparationSteps,
         userSkillLevel, userCuisines, avgRating,
         CASE
           WHEN datetime().month IN [12,1,2] THEN 'Winter'
           WHEN datetime().month IN [3,4,5] THEN 'Spring'
           WHEN datetime().month IN [6,7,8] THEN 'Summer'
           ELSE 'Fall'
         END as currentSeason

    // Calculate scores
    WITH r, c, ingredients, occasions, seasons, preparationSteps, avgRating,
         // Difficulty score
         CASE
           WHEN r.difficulty = 'easy' AND toLower(userSkillLevel) = 'beginner' THEN 3.0
           WHEN r.difficulty = 'medium' AND toLower(userSkillLevel) = 'intermediate' THEN 3.0
           WHEN r.difficulty = 'hard' AND toLower(userSkillLevel) = 'advanced' THEN 3.0
           WHEN r.difficulty = r.difficulty THEN 1.0
           ELSE 0.0
         END as difficultyScore,
         // Cuisine score
         CASE WHEN c.name IN userCuisines THEN 2.0 ELSE 0.0 END as cuisineScore,
         // Season score
         CASE WHEN currentSeason IN seasons THEN 1.0 ELSE 0.0 END as seasonScore

    // Calculate total score and create recipe object
    WITH {
      id: r.id,
      name: r.name,
      difficulty: r.difficulty,
      cookingTime: r.cooking_time,
      servingSize: r.serving_size,
      calories: r.calories,
      cost: r.cost,
      popularityScore: coalesce(r.popularityScore, 0),
      ingredients: ingredients,
      cuisine: c.name,
      occasions: occasions,
      seasons: seasons,
      preparationSteps: preparationSteps,
      rating: avgRating
    } as recipe,
    (difficultyScore + cuisineScore + seasonScore + coalesce(r.popularityScore, 0) / 20.0 + avgRating) as totalScore

    // Return sorted results
    RETURN recipe
    ORDER BY totalScore DESC
    LIMIT toInteger($limit)
  `;

  const result = neo4j.executeQuery(hostName, query, vars);
  const recipes: Recipe[] = [];
  for (let i = 0; i < result.Records.length; i++) {
    recipes.push(JSON.parse<Recipe>(result.Records[i].get("recipe")));
  }
  return recipes;
}
/**
 * Find similar recipes based on ingredients and cuisine
 */
export function findSimilarRecipes(recipeId: string, limit: i32 = 5): Recipe[] {
  const vars = new neo4j.Variables();
  vars.set("recipeId", recipeId);
  vars.set("limit", limit);

  const query = `
     // Match source recipe and its relationships
MATCH (source:Recipe {id: $recipeId})
MATCH (source)-[:HAS_CUISINE]->(sourceCuisine:Cuisine)
MATCH (source)<-[:USED_IN]-(sourceIngr:Ingredient)
WITH source, sourceCuisine, collect(sourceIngr.name) AS sourceIngredients

// Find similar recipes
MATCH (r:Recipe)
WHERE r.id <> source.id
MATCH (r)<-[:USED_IN]-(i:Ingredient)
OPTIONAL MATCH (r)-[:HAS_CUISINE]->(c:Cuisine)

// Calculate similarity based on ingredients and cuisine
WITH r, c, collect(i.name) AS recipeIngredients, sourceCuisine, sourceIngredients,
     CASE WHEN c = sourceCuisine THEN 1 ELSE 0 END AS sameCuisine,
     size([x IN collect(i.name) WHERE x IN sourceIngredients]) AS sharedIngredients

WITH r,
     (toFloat(sharedIngredients) * 0.7 + toFloat(sameCuisine) * 0.3) AS similarityScore
WHERE similarityScore > 0

// Get all recipe details
MATCH (r)<-[:USED_IN]-(i:Ingredient)
MATCH (r)<-[:PRESENT_IN]-(a:Allergen)
MATCH (r)-[:HAS_CUISINE]->(c:Cuisine)
MATCH (r)-[:SUITABLE_FOR]->(o:Occasion)
MATCH (r)-[:BEST_IN]->(s:Season)
MATCH (r)-[:HAS_STEP]->(p:PreparationStep)
OPTIONAL MATCH (r)<-[rate:RATED]-()

// Collect all related data
WITH DISTINCT r, similarityScore,
     collect(DISTINCT i.name) AS ingredients,
     collect(DISTINCT a.name) AS allergens,
     c.name AS cuisine,
     collect(DISTINCT o.name) AS occasions,
     collect(DISTINCT s.name) AS seasons,
     collect(DISTINCT p.description) AS preparationSteps,
     avg(rate.rating) AS rating

WITH {
    id: r.id,
    name: r.name,
    difficulty: r.difficulty,
    cookingTime: r.cooking_time,
    servingSize: r.serving_size,
    calories: r.calories,
    cost: r.cost,
    popularityScore: r.popularity_score,
    seasonalAvailability: r.seasonal_availability,
    ingredients: ingredients,
    allergens: allergens,
    cuisine: cuisine,
    occasions: occasions,
    seasons: seasons,
    preparationSteps: preparationSteps,
    rating: coalesce(rating, 0.0)
} AS recipe, similarityScore
ORDER BY similarityScore DESC
LIMIT toInteger($limit)

// Return the final result
RETURN recipe

      `;

  const result = neo4j.executeQuery(hostName, query, vars);
  const recipe: Recipe[] = [];
  for (let i = 0; i < result.Records.length; i++) {
    recipe.push(JSON.parse<Recipe>(result.Records[i].get("recipe")));
  }
  return recipe;
}
/**
 * Search recipes by name, ingredients, or cuisine
 */
export function searchRecipes(searchTerm: string, limit: i32 = 10): Recipe[] {
  const vars = new neo4j.Variables();
  vars.set("searchTerm", searchTerm.toLowerCase());
  vars.set("limit", limit);

  const query = `
    MATCH (r:Recipe)
    WHERE toLower(r.name) CONTAINS $searchTerm
    OR EXISTS {
      MATCH (r)<-[:USED_IN]-(i:Ingredient)
      WHERE toLower(i.name) CONTAINS $searchTerm
    }
    OR EXISTS {
      MATCH (r)-[:HAS_CUISINE]->(c:Cuisine)
      WHERE toLower(c.name) CONTAINS $searchTerm
    }
    OR EXISTS{
    MATCH (r)-[:SUITABLE_FOR]->(o:Occasion)
      WHERE toLower(o.name) CONTAINS $searchTerm
    }
    OR EXISTS{
      MATCH (r)-[:BEST_IN]->(s:Season)
        WHERE toLower(s.name) CONTAINS $searchTerm
    }
    
    MATCH (r)<-[:USED_IN]-(i:Ingredient)
    MATCH (r)<-[:PRESENT_IN]-(a:Allergen)
    MATCH (r)-[:HAS_CUISINE]->(c:Cuisine)
    MATCH (r)-[:SUITABLE_FOR]->(o:Occasion)
    MATCH (r)-[:BEST_IN]->(s:Season)
    MATCH (r)-[:HAS_STEP]->(p:PreparationStep)
    MATCH(r)<-[rate:RATED]-()
    
    WITH r,
         collect(DISTINCT i.name) as ingredients,
         collect(DISTINCT a.name) as allergens,
         c.name as cuisine,
         collect(DISTINCT o.name) as occasions,
         collect(DISTINCT s.name) as seasons,
         p.description as preparationSteps,
         avg(rate.rating) as rating
    
    RETURN {
      id: r.id,
      name: r.name,
      difficulty: r.difficulty,
      cookingTime: r.cooking_time,
      servingSize: r.serving_size,
      calories: r.calories,
      cost: r.cost,
      popularityScore: r.popularity_score,
      seasonalAvailability: r.seasonal_availability,
      ingredients: ingredients,
      allergens: allergens,
      cuisine: cuisine,
      occasions: occasions,
      seasons: seasons,
      preparationSteps: preparationSteps,
      rating: rating
    } as recipe
    LIMIT toInteger($limit)
    `;

  const result = neo4j.executeQuery(hostName, query, vars);
  const recipe: Recipe[] = [];
  for (let i = 0; i < result.Records.length; i++) {
    recipe.push(JSON.parse<Recipe>(result.Records[i].get("recipe")));
  }
  return recipe;
}

/**
 * Delete a meal plan and its relationships
 */
export function deleteMealPlan(mealPlanId: string): boolean {
  const vars = new neo4j.Variables();
  vars.set("mealPlanId", mealPlanId);

  const query = `
    MATCH (mp:MealPlan {id: $mealPlanId})
    OPTIONAL MATCH (mp)-[:CONTAINS]->(pm:PlannedMeal)
    OPTIONAL MATCH (mp)-[:HAS_LIST]->(sl:ShoppingList)-[:CONTAINS]->(si:ShoppingItem)
    DETACH DELETE mp, pm, sl, si
    RETURN true as success
    `;

  const result = neo4j.executeQuery(hostName, query, vars);
  return true;
}

export function getCusines(): string[] {
  const query = `
    MATCH (c:Cuisine)
    RETURN c.name as cuisine
    `;
  const result = neo4j.executeQuery(hostName, query);
  const cuisines: string[] = [];
  for (let i = 0; i < result.Records.length; i++) {
    cuisines.push(result.Records[i].getValue<string>("cuisine"));
  }
  return cuisines;
}

export function getAllergens(): string[] {
  const query = `
    MATCH (a:Allergen)  
    RETURN a.name as allergen
    `;
  const result = neo4j.executeQuery(hostName, query);
  const allergens: string[] = [];
  for (let i = 0; i < result.Records.length; i++) {
    allergens.push(result.Records[i].getValue<string>("allergen"));
  }
  return allergens;
}

export function getAllMealPlans(userId: string): MealPlan[] {
  const vars = new neo4j.Variables();
  vars.set("userId", userId);

  const query = `
MATCH (u:User {id: $userId})-[:HAS_PLAN]->(mp:MealPlan)
OPTIONAL MATCH (mp)-[:CONTAINS]->(pm:PlannedMeal)-[:USES]->(r:Recipe)
WITH mp, u, collect({
    recipeId: pm.recipeId,
    date: toString(pm.date),
    mealType: pm.mealType,
    servings: pm.servings
}) as allMeals
WITH mp, u, 
    CASE 
        WHEN size(allMeals) = 0 OR all(meal IN allMeals WHERE meal.recipeId IS NULL) 
        THEN []
        ELSE [meal IN allMeals WHERE meal.recipeId IS NOT NULL]
    END as meals
RETURN {
    id: mp.id,
    userId: u.id,
    startDate: toString(mp.startDate),
    endDate: toString(mp.endDate),
    meals: meals
} as mealPlan
    `;

  const result = neo4j.executeQuery(hostName, query, vars);
  const mealPlans: MealPlan[] = [];
  for (let i = 0; i < result.Records.length; i++) {
    mealPlans.push(JSON.parse<MealPlan>(result.Records[i].get("mealPlan")));
  }
  return mealPlans;
}

export function getMealPlanById(mealPlanId: string): MealPlan {
  const vars = new neo4j.Variables();
  vars.set("mealPlanId", mealPlanId);

  const query = `
   MATCH (u:User )-[:HAS_PLAN]->(mp:MealPlan {id: $mealPlanId})
    MATCH (mp)-[:CONTAINS]->(pm:PlannedMeal)-[:USES]->(r:Recipe)
    
    WITH mp, u,
        collect({
          recipeId: pm.recipeId,
          date: toString(pm.date),
          mealType: pm.mealType,
          servings: pm.servings
        }) as meals
    RETURN {
      id: mp.id,
      userId: u.id,
      startDate: toString(mp.startDate),
      endDate: toString(mp.endDate),
      meals:meals
    } as mealPlan
    `;

  const result = neo4j.executeQuery(hostName, query, vars);

  return JSON.parse<MealPlan>(result.Records[0].get("mealPlan"));
}

export function getRecipeById(recipeId: string, userId: string): Recipe {
  const vars = new neo4j.Variables();
  vars.set("recipeId", recipeId);
  vars.set("userId", userId);

  const query = ` 
    MATCH (u:User {id: $userId})
    MATCH (r:Recipe {id: $recipeId})
    MATCH (r)<-[:USED_IN]-(i:Ingredient)
    MATCH (r)<-[:PRESENT_IN]-(a:Allergen)
    MATCH (r)-[:HAS_CUISINE]->(c:Cuisine)
    MATCH (r)-[:SUITABLE_FOR]->(o:Occasion)
    MATCH (r)-[:BEST_IN]->(s:Season)
    MATCH (r)-[:HAS_STEP]->(p:PreparationStep)
    MATCH(r)<-[rate:RATED]-()
    //check if user has rated
    OPTIONAL MATCH (u)-[r2:FAVORITE]->(r)

    WITH r, r2,
         collect(DISTINCT i.name) as ingredients,
         collect(DISTINCT a.name) as allergens,
         c.name as cuisine,
         collect(DISTINCT o.name) as occasions,
         collect(DISTINCT s.name) as seasons,
         p.description as preparationSteps,
         avg(rate.rating) as rating
    

    RETURN {
      id: r.id,
      name: r.name,
      difficulty: r.difficulty,
      cookingTime: r.cooking_time,
      servingSize: r.serving_size,
      calories: r.calories,
      cost: r.cost,
      popularityScore: r.popularity_score,
      seasonalAvailability: r.seasonal_availability,
      ingredients: ingredients,
      allergens: allergens,
      cuisine: cuisine,
      occasions: occasions,
      seasons: seasons,
      preparationSteps: preparationSteps,
      rating: rating,
      favourite: CASE WHEN r2 IS NOT NULL THEN true ELSE false END
    } as recipe
    `;

  const result = neo4j.executeQuery(hostName, query, vars);

  return JSON.parse<Recipe>(result.Records[0].get("recipe"));
}

/**
 * Delete a meal from the plan and update the shopping list
 */
export function deleteMealFromPlan(
  mealPlanId: string,
  plannedMealId: string,
  userId: string,
): boolean {
  const vars = new neo4j.Variables();
  vars.set("mealPlanId", mealPlanId);
  vars.set("plannedMealId", plannedMealId);
  vars.set("userId", userId);

  const query = `
  // Match and delete the planned meal
  MATCH (mp:MealPlan {id: $mealPlanId})-[:CONTAINS]->(pm:PlannedMeal {recipeId: $plannedMealId})
  OPTIONAL MATCH (pm)-[uses:USES]->(r:Recipe)
  DETACH DELETE pm

  // Update the shopping list
  WITH mp, r
  MATCH (sl:ShoppingList)<-[:HAS_LIST]-(mp)
  MATCH (sl)-[:CONTAINS]->(si:ShoppingItem)-[:FOR]->(:Ingredient)-[:USED_IN]->(r)
  DETACH DELETE si

  // Ensure no orphaned ShoppingList
  WITH sl
  OPTIONAL MATCH (sl)-[:CONTAINS]->(remainingItems)
  WHERE remainingItems IS NULL
  DETACH DELETE sl

  RETURN true AS success
  `;

  const result = neo4j.executeQuery(hostName, query, vars);
  return result.Records[0].getValue<boolean>("success");
}
