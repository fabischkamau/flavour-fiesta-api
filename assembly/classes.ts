
@json
export class Recipe {
  id: string;
  name: string;
  difficulty: string;
  cookingTime: i32;
  servingSize: i32;
  calories: i32;
  cost: f32;
  popularityScore: i32;
  seasonalAvailability: boolean;
  ingredients: string[] = [];
  cuisine: string;
  allergens: string[] = [];
  occasions: string[] = [];
  seasons: string[] = [];
  preparationSteps: string;
  rating: f32 = 0.0;
  favourite: boolean;

  constructor(
    id: string,
    name: string,
    difficulty: string,
    cookingTime: i32,
    servingSize: i32,
    calories: i32,
    cost: f32,
    popularityScore: i32,
    seasonalAvailability: boolean,
    cuisine: string,
    preparationSteps: string,
    rating: f32,
    ingredients: string[],
    allergens: string[] = [],
    occasions: string[] = [],
    seasons: string[] = [],
    favourite?: boolean,
  ) {
    this.id = id;
    this.name = name;
    this.difficulty = difficulty;
    this.cookingTime = cookingTime;
    this.servingSize = servingSize;
    this.calories = calories;
    this.cost = cost;
    this.popularityScore = popularityScore;
    this.seasonalAvailability = seasonalAvailability;
    this.cuisine = cuisine;
    this.preparationSteps = preparationSteps;
    this.rating = rating;
    this.ingredients = ingredients;
    this.allergens = allergens;
    this.occasions = occasions;
    this.seasons = seasons;
    this.favourite = favourite = false;
  }
}


@json
export class PreparationStep {
  stepNumber: i32;
  description: string;

  constructor(stepNumber: i32, description: string) {
    this.stepNumber = stepNumber;
    this.description = description;
  }
}


@json
export class UserPreferences {
  dietaryRestrictions: string[] = [];
  allergens: string[] = [];
  favoriteCuisines: string[] = [];
  skillLevel: string = "Easy";
}

@json
export class UserPreferencesResponse {
  dietaryRestrictions: string[] = [];
  allergens: string[] = [];
  favoriteCuisines: string[] = [];
  skillLevel: string = "Easy";

  constructor(
    dietaryRestrictions:string[],
    allergens: string[],
    favoriteCuisines: string[],
    skillLevel:string
  ){
    this.dietaryRestrictions=dietaryRestrictions;
    this.allergens=allergens;
    this.favoriteCuisines=favoriteCuisines;
    this.skillLevel=skillLevel;
  }
}


@json
export class User {
  id: string;
  email: string;
  name: string;
  preferences: UserPreferences;
  favoriteRecipes: string[] = [];

  constructor(
    id: string,
    email: string,
    name: string,
    preferences: UserPreferences,
  ) {
    this.id = id;
    this.email = email;
    this.name = name;
    this.preferences = preferences;
    this.favoriteRecipes = [];
  }
}


@json
export class Ingredient {
  name: string;

  constructor(name: string) {
    this.name = name;
  }
}


@json
export class SearchResult {
  recipe: Recipe;
  score: f32 = 0.0;

  constructor(recipe: Recipe, score: f32) {
    this.recipe = recipe;
    this.score = score;
  }
}


@json
export class MealPlan {
  id: string;
  userId: string;
  startDate: string;
  endDate: string;
  meals: PlannedMeal[] = [];

  constructor(id: string, userId: string, startDate: string, endDate: string) {
    this.id = id;
    this.userId = userId;
    this.startDate = startDate;
    this.endDate = endDate;
    this.meals = [];
  }
}


@json
export class PlannedMeal {
  recipeId: string;
  date: string;
  mealType: string;
  servings: i32;

  constructor(recipeId: string, date: string, mealType: string, servings: i32) {
    this.recipeId = recipeId;
    this.date = date;
    this.mealType = mealType;
    this.servings = servings;
  }
}


@json
export class ShoppingList {
  id: string;
  userId: string;
  mealPlanId: string;
  items: ShoppingItem[];
  dateCreated: string;

  constructor(
    id?: string,
    userId?: string,
    mealPlanId?: string,
    dateCreated?: string,
    items?:ShoppingItem []
  ) {
    this.id = id = "";
    this.userId = userId = "";
    this.mealPlanId = mealPlanId ="";
    this.dateCreated = dateCreated = "";
    this.items = items =[];
  }
}


@json
export class ShoppingItem {
  ingredient: string;
  checked: boolean = false;

  constructor(ingredient: string) {
    this.ingredient = ingredient;
    this.checked = false;
  }
}
