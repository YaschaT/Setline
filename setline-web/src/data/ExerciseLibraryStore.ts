// ExerciseLibraryStore.swift — the online exercise library, fetched once per
// load and kept: about a megabyte, at the commit the photos are pinned to.
import { ExerciseLibrary, type ExerciseLibrary_Entry } from "../core/Catalog/ExerciseLibrary";
import { ExerciseMedia } from "../core/Catalog/ExerciseMedia";

let loading: Promise<ExerciseLibrary | undefined> | undefined;

export const ExerciseLibraryStore = {
  /** The library, or undefined when it can't be reached (a later call tries again). */
  load(): Promise<ExerciseLibrary | undefined> {
    loading ??= fetch(ExerciseMedia.libraryURL)
      .then((response) => (response.ok ? (response.json() as Promise<ExerciseLibrary_Entry[]>) : Promise.reject(new Error("library"))))
      .then((entries) => new ExerciseLibrary(entries))
      .catch(() => {
        loading = undefined;
        return undefined;
      });
    return loading;
  },
};
