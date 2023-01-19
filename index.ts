import express from "express";
import rateLimit from "express-rate-limit";

interface Ingredient {
  ingredient: string;
  measurement: string;
}

interface Meal {
  id: number;
  name: string;
  instructions: string;
  tags: string[];
  thumbUrl: string;
  youtubeUrl: string;
  ingredients: Ingredient[];
}
interface MainIngredientResponse {
  meals:
    | {
        strMeal: string;
        strMealThumb: string;
        idMeal: string;
      }[]
    | null;
}

interface LookUpEndPointResponse {
  meals: LookUpEndMeal[];
}

interface LookUpEndMeal {
  idMeal: string;
  strMeal: string;
  strInstructions: string;
  strMealThumb: string;
  strTags: string;
  strYoutube: string;
}

interface Response {
  meals: Meal[];
}

/*
 * Limiting the amount of requests that can come from same IP address
 * Potential Next Step: rate limit on specific account (example 2 people in same home)
 */
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // Limit each IP to 20 requests per `window` (here, per 15 minutes)
  standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
  legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
const mealsDbUrl = "https://www.themealdb.com/api/json/v1/1/";
const app = express();
app.use(limiter);

// usage for input sanitizing library with node.js
app.use(require("sanitize").middleware);

/*
 * Description: return final APi response of meals with main ingredient
 * Param: main ingredient
 * Return: array of Meals that have given main ingredient
 */
const getMealsWithMainIngredient = async (
  ingredient: string
): Promise<Meal[]> => {
  const urlWithIngredient = mealsDbUrl + "filter.php" + `?i=${ingredient}`;

  const response = await fetch(urlWithIngredient, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });
  const responseJson: MainIngredientResponse = await response.json();

  // error handling some responses return { meals: null }
  if (responseJson.meals === null) {
    return [];
  }

  let meals: Meal[] = [];
  for (const meal of responseJson.meals) {
    const returnedMeal = await getMealWithId(meal.idMeal);
    if (returnedMeal) {
      meals.push(returnedMeal);
    }
  }
  return meals;
};

/*
 * Description: return Meal with valid typing for final response
 * Param: mealId
 * Return: if valid mealId returns valid final response Meal or if not valid mealId returns undefined
 */
const getMealWithId = async (mealId: string): Promise<Meal | undefined> => {
  let url = mealsDbUrl + "/lookup.php?i=" + mealId;

  const response = await fetch(url, {
    method: "GET",
    headers: {
      accept: "application/json",
    },
  });
  const responseJson: LookUpEndPointResponse = await response.json();
  let mealsWithID = responseJson.meals;
  if (mealsWithID.length > 1) {
    mealsWithID = responseJson.meals.filter((meal) => {
      return meal.idMeal === mealId;
    });
  }

  // edge cases for filtered mealsWithID
  if (mealsWithID.length == 0) {
    return undefined;
  }
  if (mealsWithID.length > 1) {
    console.log(
      `multiple meals with id ${mealId} using first meal in response only`
    );
  }
  const id = Number(mealsWithID[0].idMeal);
  if (isNaN(id)) {
    console.log(`${mealsWithID[0].idMeal} is not number. Meal not being added`);
    return undefined;
  }
  let meal = {
    id: Number(mealsWithID[0].idMeal),
    name: mealsWithID[0].strMeal,
    instructions: mealsWithID[0].strInstructions,
    tags: mealsWithID[0].strTags?.split(",") ?? [],
    thumbUrl: mealsWithID[0].strMealThumb,
    youtubeUrl: mealsWithID[0].strYoutube,
    ingredients: getIngredients(mealsWithID[0]),
  };
  return meal;
};

/*
 * Description: returns array of valid ingredient with appropriate type for a given meal
 * Param: meal with type from lookup end point
 * Return: Ingredient array
 */
const getIngredients = (meal: LookUpEndMeal): Ingredient[] => {
  const ingredients = [];
  for (let index = 1; index < 21; index++) {
    const ingredient = getNthIngredient(meal, index);
    if (ingredient) {
      ingredients.push(ingredient);
    }
  }
  return ingredients;
};

/*
 * Description: returns nth ingredient with appropriate type if the ingredient exists.
 * Ingredient will not exist if strIngredient# field in meal is empty or blank string
 * Param: meal with type from lookup end point, id is ingredient id
 * Return: Ingredient if valid ingredient or undefined if not valid ingredient
 */
const getNthIngredient = (meal: any, id: number): Ingredient | undefined => {
  const ingredientKey = "strIngredient" + id;
  const measurementKey = "strMeasure" + id;

  const ingredient = meal[ingredientKey]?.trim();
  let measurement = meal[measurementKey]?.trim() || "";
  if (!ingredient || ingredientKey.length == 0) {
    return undefined;
  }

  return { ingredient, measurement };
};

app.get("/", (req, res) => {
  res.send("Please enter the main ingredient to search recipes for!");
});

app.get("/:mainIngredient", async (req, res) => {
  let { mainIngredient } = req.params;
  mainIngredient = mainIngredient.trim();

  // Error Handling: empty main ingredient
  if (mainIngredient.length < 1) {
    let error = {
      name: "Invalid Ingredient Input",
      description:
        "Main ingredient is empty or blank space. Please enter valid ingredient",
    };
    return res.send(error);
  }

  // Error Handling: non letter input for ingredient
  if (/[^\sa-zA-Z]/.test(mainIngredient)) {
    let error = {
      name: "Invalid Ingredient Input",

      description:
        "Main ingredient can only contain letters. Your ingredient contained non letter input",
    };
    return res.send(error);
  }

  let meals: Meal[] = await getMealsWithMainIngredient(mainIngredient);

  /* handling making the call for the singular or plural version of ingredient
   * ensures that regardless of plurality carrot & carrots will both yield same
   * recipe results
   */
  const isIngredientPlural =
    mainIngredient.charAt(mainIngredient.length - 1) == "s";
  if (isIngredientPlural) {
    const singularIngredient = mainIngredient.substring(
      0,
      mainIngredient.length - 1
    );
    const mealsSingularIngredient: Meal[] = await getMealsWithMainIngredient(
      singularIngredient
    );
    meals = meals.concat(mealsSingularIngredient);
  } else {
    const pluralIngredient = mainIngredient + "s";
    const mealsPluralIngredient: Meal[] = await getMealsWithMainIngredient(
      pluralIngredient
    );
    meals = meals.concat(mealsPluralIngredient);
  }
  return res.send(meals);
});

const port = process.env.PORT || 3000;

app.listen(port, () => console.log(`app listening on port ${port}`));
