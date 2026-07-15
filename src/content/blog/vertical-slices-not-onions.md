---
title: 'Vertical slices, not onions: structuring a .NET service for change'
description: "Layered/onion architecture optimises for a kind of reuse most services never need. Feature-first vertical slices optimise for the thing you actually do all day: change one behaviour without touching five folders."
pubDate: 2026-07-07
tags: ['dotnet', 'architecture']
---

Open a "clean architecture" .NET solution and you know the shape before you read a
line: `Domain`, `Application`, `Infrastructure`, `Api`. To add one endpoint you
touch a controller, a service interface, its implementation, a repository
interface, its implementation, a DTO, and a mapper — seven files across four
projects for one behaviour.

That layout optimises for swapping a whole horizontal layer. In fifteen years I
have almost never done that. What I do every day is change **one feature**. So I
organise around features.

## Slices, not layers

A vertical slice keeps everything one feature needs in one place — the endpoint,
its validation, its handler, its data access — and lets unrelated features stay
unrelated.

```text
Features/
  Orders/
    CreateOrder.cs        // endpoint + request + validator + handler
    GetOrder.cs
    Orders.Endpoints.cs   // maps the group
  Catalog/
    SearchCatalog.cs
```

`CreateOrder.cs` holds the whole story:

```csharp
public static class CreateOrder
{
    public record Request(string Sku, int Quantity);

    public class Validator : AbstractValidator<Request>
    {
        public Validator()
        {
            RuleFor(x => x.Sku).NotEmpty();
            RuleFor(x => x.Quantity).GreaterThan(0);
        }
    }

    public static async Task<Results<Created<OrderId>, ValidationProblem>> Handle(
        Request request, AppDbContext db, CancellationToken ct)
    {
        var order = Order.Create(request.Sku, request.Quantity);
        db.Orders.Add(order);
        await db.SaveChangesAsync(ct);
        return TypedResults.Created($"/orders/{order.Id}", order.Id);
    }
}
```

No `IOrderService`, no `IOrderRepository`, no AutoMapper profile. A minimal-API
endpoint calls `Handle` directly. Cross-cutting concerns — auth, logging,
validation — live in endpoint filters, not in a mediator pipeline.

## "But you're not decoupled!"

Right — and that's the point. Decoupling has a cost, and you should pay it where
coupling actually hurts, not everywhere by reflex. Two rules keep this honest:

1. **Share the domain, duplicate the plumbing.** Entities and invariants are
   shared. A read model that happens to look like another feature's read model is
   *not* shared — small duplication beats a wrong abstraction two features fight
   over.
2. **Abstract at the real seam.** The database, the clock, an external API — those
   are worth an interface because you genuinely swap them (tests, providers). A
   handler is not a seam. Don't wrap it in one.

When a slice grows complex, it gets a private helper *inside the slice*. It never
graduates to a shared service that a dozen features quietly depend on.

## What you get

- **Reading a feature is local.** Everything is in one file. New joiners map a
  change to a place in seconds.
- **Deleting a feature is `rm`.** No dangling interfaces or half-used services.
- **Tests target behaviour.** I test the handler against a real database
  (Testcontainers) rather than mocking four layers to assert the mocks were called.

Onion architecture isn't wrong. It's a big up-front bet on flexibility you can
usually buy later, at the exact seam, when you actually need it. Vertical slices
bet on the thing you do constantly — changing one behaviour — and make that cheap.
