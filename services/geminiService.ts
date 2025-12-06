import { GoogleGenAI, Type } from "@google/genai";
import { RouteStop } from "../types";
import { COLORS } from "../constants";

export const suggestNextStop = async (currentStops: RouteStop[]): Promise<Partial<RouteStop>> => {
  try {
    // Initialize GoogleGenAI with the API key from environment variables.
    // As per guidelines, we assume process.env.API_KEY is valid and accessible.
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    
    const context = currentStops.map((s, i) => `${i + 1}. ${s.title} (${s.coordinates.lat}, ${s.coordinates.lng}): ${s.description}`).join('\n');
    const lastStop = currentStops[currentStops.length - 1];
    
    const prompt = `
      Given the following project roadmap milestones in Detroit, MI:
      ${context}

      Suggest the next logical milestone location within Metro Detroit.
      The location should be a real landmark or district (e.g., Belle Isle, Motown Museum, DIA, Renaissance Center).
      Return a JSON object with:
      - 'title' (string)
      - 'description' (short string)
      - 'type' (one of: 'idea', 'time', 'email', 'chart', 'star', 'rocket')
      - 'lat' (number, latitude)
      - 'lng' (number, longitude)
      
      Ensure the coordinates are somewhat close to the previous stop (${lastStop.coordinates.lat}, ${lastStop.coordinates.lng}) but distinct.
    `;

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: prompt,
      config: {
        responseMimeType: 'application/json',
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING },
            description: { type: Type.STRING },
            type: { type: Type.STRING, enum: ['idea', 'time', 'email', 'chart', 'star', 'rocket'] },
            lat: { type: Type.NUMBER },
            lng: { type: Type.NUMBER }
          },
          required: ['title', 'description', 'type', 'lat', 'lng']
        }
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");
    
    const data = JSON.parse(text);
    
    const colors = Object.values(COLORS);
    const randomColor = colors[Math.floor(Math.random() * colors.length)];

    return {
      title: data.title,
      description: data.description,
      type: data.type,
      color: randomColor,
      coordinates: {
        lat: data.lat,
        lng: data.lng
      }
    };

  } catch (error) {
    console.error("Gemini suggestion failed:", error);
    return {
      title: "Detroit Riverwalk",
      description: "A walk along the river to reflect.",
      type: "star",
      color: COLORS.purple,
      coordinates: { lat: 42.3323, lng: -83.0396 }
    };
  }
};