import { z } from "zod";
export const ListInput=z.object({name:z.string().trim().min(1,"Dê um nome à lista.").max(60),color:z.enum(["amber","violet","blue","green","pink"]).default("amber")});
const imagePath=z.string().regex(/^\/[A-Za-z0-9_.-]+$/).max(160).nullable();
export const MovieInput=z.object({
  id:z.number().int().positive(),type:z.enum(["movie","tv"]),title:z.string().min(1).max(300),
  originalTitle:z.string().max(300).optional(),year:z.number().int().min(0).max(2200),
  genres:z.array(z.number().int().positive()).max(30),overview:z.string().max(15000),
  poster:imagePath,backdrop:imagePath,score:z.number().min(0).max(10),
  runtime:z.number().int().positive().max(20000).optional(),popularity:z.number().nonnegative(),
  providers:z.array(z.object({id:z.number().int().positive(),name:z.string().max(150),logo:imagePath.optional()})).max(200),
  availabilityKnown:z.boolean(),watchLink:z.string().url().max(500).refine(v=>{try{const u=new URL(v);return u.protocol==="https:"&&(u.hostname==="www.themoviedb.org"||u.hostname==="www.justwatch.com");}catch{return false;}}).optional(),
  source:z.enum(["demo","tmdb"]),
});
export const LibraryAction=z.discriminatedUnion("action",[
  z.object({action:z.literal("bootstrap")}),
  z.object({action:z.literal("createList"),...ListInput.shape}),
  z.object({action:z.literal("renameList"),id:z.string().min(1).max(100),...ListInput.shape}),
  z.object({action:z.literal("deleteList"),id:z.string().min(1).max(100)}),
  z.object({action:z.literal("addMovie"),listId:z.string().min(1).max(100),movie:MovieInput}),
  z.object({action:z.literal("removeMovie"),listId:z.string().min(1).max(100),key:z.string().regex(/^(movie|tv):\d+$/)}),
  z.object({action:z.literal("setWatched"),movie:MovieInput,watched:z.boolean()}),
]);
