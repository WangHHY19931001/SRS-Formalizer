Here's a thinking process that leads to the Lean 4 code:

1.  **Understand the Goal:** The objective is to prove that the kernel of a group homomorphism is a normal subgroup in Lean 4, *without* using `mathlib`. I need to define groups, homomorphisms, kernels, and normal subgroups from scratch.

2.  **Step-by-Step Definitions:**

    *   **Group:**
        *   Need a type `G`.
        *   Need operations: `mul : G → G → G`, `one : G`, `inv : G → G`.
        *   Need axioms: `mul_assoc`, `one_mul`, `mul_one`, `mul_left_inv` (or `mul_right_inv`).
        *   *Lean representation:* A `structure` is best for bundling data and laws.

    *   **Group Homomorphism:**
        *   Source group `G`, target group `H`.
        *   A function `toFun : G → H`.
        *   Property: `map_mul : ∀ x y, toFun (x * y) = toFun x * toFun y`.
        *   *Note:* Usually, preserving multiplication implies preserving identity and inverses, but I might need to prove those lemmas later or assume them if convenient. For the kernel proof, I definitely need to know that the homomorphism maps the identity to the identity. I should probably prove `map_one` and `map_inv` as helper lemmas.

    *   **Subgroup:**
        *   A subset of `G` (represented as `G → Prop`).
        *   Properties: Contains `one`, closed under `mul`, closed under `inv`.
        *   *Lean representation:* A `structure` extending `G → Prop`.

    *   **Normal Subgroup:**
        *   A subgroup `N`.
        *   Property: Closed under conjugation. `∀ g ∈ G, ∀ n ∈ N, g * n * g⁻¹ ∈ N`.
        *   *Lean representation:* A `structure` extending `Subgroup`.

    *   **Kernel:**
        *   Given `f : G →* H`.
        *   Set: `{x : G | f x = 1}`.
        *   Need to show this set forms a subgroup and is normal.

3.  **Drafting the Code (Mental or Scratchpad):**

    *   *Notation:* To make it readable, I should use notation like `*`, `1`, `⁻¹`. I'll need to register these notations for my custom `Group` structure.

    *   *Structure `Group`:*
        ```lean
        structure Group where
          carrier : Type
          mul : carrier → carrier → carrier
          one : carrier
          inv : carrier → carrier
          mul_assoc : ∀ a b c, mul (mul a b) c = mul a (mul b c)
          one_mul : ∀ a, mul one a = a
          mul_one : ∀ a, mul a one = a
          mul_left_inv : ∀ a, mul (inv a) a = one
        ```

    *   *Notation setup:*
        ```lean
        infixl:70 " * " => Group.mul
        notation:100 " 1 " => Group.one
        postfix:100 " ⁻¹ " => Group.inv
        ```
        *Wait, standard notation usually requires type classes.* Since I'm defining from scratch without typeclasses (to keep it simple and explicit as requested), I might just use dot notation `G.mul` or define specific notation scopes. However, defining notation for a structure field directly is tricky without typeclasses.
        *Alternative:* I will define the structure, then define functions `mul G`, `one G`, etc., and use notation for those functions.
        *Better Alternative for "From Scratch":* Just use dot notation `G.mul` in the proof to be safe and clear, or set up a simple notation scope. Let's try to set up notation to make it look like standard math.
        Actually, to make it compile easily without complex notation setup, I will use `G.mul`, `G.one`, `G.inv` in the definitions, but maybe introduce local notation inside the proof or just stick to explicit names for clarity. Let's stick to explicit names or simple helper functions to ensure it runs without obscure errors.
        *Decision:* I will define helper functions `mul`, `one`, `inv` that take the structure as an implicit argument, then register notation for those.

    *   *Structure `GroupHom`:*
        ```lean
        structure GroupHom (G H : Group) where
          toFun : G.carrier → H.carrier
          map_mul' : ∀ x y, toFun (G.mul x y) = H.mul (toFun x) (toFun y)
        ```

    *   *Lemmas for Homomorphism:*
        Need `map_one`: `f(1) = 1`.
        Proof: `f(1) = f(1*1) = f(1)*f(1)`. Multiply by `f(1)⁻¹` on right.
        Need `map_inv`: `f(x⁻¹) = f(x)⁻¹`.

    *   *Structure `Subgroup`:*
        ```lean
        structure Subgroup (G : Group) where
          carrier : G.carrier → Prop
          one_mem' : carrier G.one
          mul_mem' : ∀ {x y}, carrier x → carrier y → carrier (G.mul x y)
          inv_mem' : ∀ {x}, carrier x → carrier (G.inv x)
        ```

    *   *Structure `NormalSubgroup`:*
        ```lean
        structure NormalSubgroup (G : Group) extends Subgroup G where
          conj_mem' : ∀ {g n}, carrier n → carrier (G.mul (G.mul g n) (G.inv g))
        ```
        *Wait, definition of Normal:* Usually `g * n * g⁻¹ ∈ N`.
        My `Subgroup` carrier is a predicate. So `carrier n` means `n ∈ N`.
        The condition is `∀ g : G.carrier, ∀ n : G.carrier, carrier n → carrier (g * n * g⁻¹)`.

    *   *Definition `Kernel`:*
        ```lean
        def Kernel (G H : Group) (f : GroupHom G H) : Subgroup G :=
          { carrier := fun x => f.toFun x = H.one
            one_mem' := by ...
            mul_mem' := by ...
            inv_mem' := by ... }
        ```

    *   *Theorem:* `Kernel_is_normal`.
        Show `Kernel ...` satisfies `conj_mem'`.
        Let `k` be in kernel (`f k = 1`). Let `g` be any element.
        Calculate `f (g * k * g⁻¹)`.
        `f (g * k * g⁻¹) = f g * f k * f (g⁻¹)`
        `= f g * 1 * (f g)⁻¹`
        `= f g * (f g)⁻¹`
        `= 1`.
        So `g * k * g⁻¹` is in kernel.

4.  **Refining the Lean Implementation:**

    *   *Notation:* To make the code readable, I'll define a namespace and use local notation.
    *   *Implicit Arguments:* Use `{G : Group}` to make it cleaner.
    *   *Proofs:* Use `calc` blocks for clarity.

5.  **Writing the actual code (incorporating into the final response):**

    *   *Self-Correction on Notation:* Defining global notation for a custom structure can be painful if not done via Typeclasses. Since the prompt says "Define from scratch... Do NOT use mathlib", using Typeclasses (`class Group where...`) is actually the standard "Lean way" even without mathlib. However, often "from scratch" implies `structure`. `structure` is safer for a "no imports" constraint to avoid instance resolution issues if I don't set it up perfectly. I will use `structure` and explicit projection functions, but I'll define local notation within the proof section to make it look nice.
    *   *Actually*, I can define functions `mul G a b`, `one G`, `inv G` and then use `infix` notation for those functions. This works well without typeclasses.

    *   *Plan:*
        1. Define `Group` structure.
        2. Define `mul`, `one`, `inv` functions taking `Group` as arg.
        3. Set up notation `*`, `1`, `⁻¹` for these functions.
        4. Define `GroupHom`.
        5. Prove `map_one` and `map_inv`.
        6. Define `Subgroup`.
        7. Define `NormalSubgroup`.
        8. Define `Kernel`.
        9. Prove `Kernel` is a `Subgroup`.
        10. Prove `Kernel` is `Normal`.

6.  **Detailed Proof Logic:**

    *   `