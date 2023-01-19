"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
/*
 * Limiting the amount of requests that can come from same IP address
 * Potential Next Step: rate limit on specific account (example 2 people in same home)
 */
const limiter = (0, express_rate_limit_1.default)({
    windowMs: 15 * 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false, // Disable the `X-RateLimit-*` headers
});
const mealsDbUrl = "https://www.themealdb.com/api/json/v1/1/";
const app = (0, express_1.default)();
app.use(limiter);
// usage for input sanitizing library with node.js
app.use(require("sanitize").middleware);
/*
 * Description: return final APi response of meals with main ingredient
 * Param: main ingredient
 * Return: array of Meals that have given main ingredient
 */
const getMealsWithMainIngredient = (ingredient) => __awaiter(void 0, void 0, void 0, function* () {
    const urlWithIngredient = mealsDbUrl + "filter.php" + `?i=${ingredient}`;
    const response = yield fetch(urlWithIngredient, {
        method: "GET",
        headers: {
            accept: "application/json",
        },
    });
    const responseJson = yield response.json();
    // error handling some responses return { meals: null }
    if (responseJson.meals === null) {
        return [];
    }
    let meals = [];
    for (const meal of responseJson.meals) {
        const returnedMeal = yield getMealWithId(meal.idMeal);
        if (returnedMeal) {
            meals.push(returnedMeal);
        }
    }
    return meals;
});
/*
 * Description: return Meal with valid typing for final response
 * Param: mealId
 * Return: if valid mealId returns valid final response Meal or if not valid mealId returns undefined
 */
const getMealWithId = (mealId) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    let url = mealsDbUrl + "/lookup.php?i=" + mealId;
    const response = yield fetch(url, {
        method: "GET",
        headers: {
            accept: "application/json",
        },
    });
    const responseJson = yield response.json();
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
        console.log(`multiple meals with id ${mealId} using first meal in response only`);
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
        tags: (_b = (_a = mealsWithID[0].strTags) === null || _a === void 0 ? void 0 : _a.split(",")) !== null && _b !== void 0 ? _b : [],
        thumbUrl: mealsWithID[0].strMealThumb,
        youtubeUrl: mealsWithID[0].strYoutube,
        ingredients: getIngredients(mealsWithID[0]),
    };
    return meal;
});
/*
 * Description: returns array of valid ingredient with appropriate type for a given meal
 * Param: meal with type from lookup end point
 * Return: Ingredient array
 */
const getIngredients = (meal) => {
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
const getNthIngredient = (meal, id) => {
    var _a, _b;
    const ingredientKey = "strIngredient" + id;
    const measurementKey = "strMeasure" + id;
    const ingredient = (_a = meal[ingredientKey]) === null || _a === void 0 ? void 0 : _a.trim();
    let measurement = ((_b = meal[measurementKey]) === null || _b === void 0 ? void 0 : _b.trim()) || "";
    if (!ingredient || ingredientKey.length == 0) {
        return undefined;
    }
    return { ingredient, measurement };
};
app.get("/", (req, res) => {
    res.send("Please enter the main ingredient to search recipes for!");
});
app.get("/:mainIngredient", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    let { mainIngredient } = req.params;
    mainIngredient = mainIngredient.trim();
    // Error Handling: empty main ingredient
    if (mainIngredient.length < 1) {
        let error = {
            name: "Invalid Ingredient Input",
            description: "Main ingredient is empty or blank space. Please enter valid ingredient",
        };
        return res.send(error);
    }
    // Error Handling: non letter input for ingredient
    if (/[^a-zA-Z]/.test(mainIngredient)) {
        let error = {
            name: "Invalid Ingredient Input",
            description: "Main ingredient can only contain letters. Your ingredient contained non letter input",
        };
        return res.send(error);
    }
    let meals = yield getMealsWithMainIngredient(mainIngredient);
    /* handling making the call for the singular or plural version of ingredient
     * ensures that regardless of plurality carrot & carrots will both yield same
     * recipe results
     */
    const isIngredientPlural = mainIngredient.charAt(mainIngredient.length - 1) == "s";
    if (isIngredientPlural) {
        const singularIngredient = mainIngredient.substring(0, mainIngredient.length - 1);
        const mealsSingularIngredient = yield getMealsWithMainIngredient(singularIngredient);
        meals = meals.concat(mealsSingularIngredient);
    }
    else {
        const pluralIngredient = mainIngredient + "s";
        const mealsPluralIngredient = yield getMealsWithMainIngredient(pluralIngredient);
        meals = meals.concat(mealsPluralIngredient);
    }
    return res.send(meals);
}));
const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`app listening on port ${port}`));
